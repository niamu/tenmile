const express = require("express");
const fileUpload = require("express-fileupload");
const JSZip = require("jszip");
const AWS = require("aws-sdk");
const xid = require("xid-js");

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const app = express();

const UNPROCESSABLE = 422; // HTTP 422 Unprocessable Entity

const fiftyKilobytesInBytes = 50 * 1024;
const maximumFileSizeInBytes = fiftyKilobytesInBytes;
const maximumByteRatioInQuote = 0.3;

app.use(
  fileUpload({
    abortOnLimit: true,
    limits: {
      fileSize: maximumFileSizeInBytes,
      fields: 1,
      files: 1
    }
  })
);

app.post("/upload", async function(req, res) {
  if (!req.files) {
    res.send({
      status: false,
      message: "No files sent"
    });
  }

  const zip = await JSZip().loadAsync(req.files.file.data);

  if (
    !(
      "rom.bin" in zip.files &&
      "romMask.bin" in zip.files &&
      "initialState.msgpack" in zip.files
    )
  ) {
    res.status(UNPROCESSABLE).send("Required files are missing");
  }

  const rom = await zip.file("rom.bin").async("uint8array");
  const romMask = await zip.file("romMask.bin").async("uint8array");
  if (rom.length != romMask.length) {
    res.status(UNPROCESSABLE).send("rom.bin and romMask.bin length mismatch");
  }

  let maskContents = { 0: 1, 1: 1 };
  try {
    romMask.map(function(byte) {
      maskContents[byte] += 1;
    });
  } catch {
    res.status(UNPROCESSABLE).send("romMask.bin contains invalid data");
  }

  const byteRatio = maskContents["1"] / (maskContents["1"] + maskContents["0"]);
  if (byteRatio > maximumByteRatioInQuote) {
    res.status(UNPROCESSABLE).send("Too many valid bytes included in rom.bin");
  }

  let romContents = { 0: 1 };
  rom.map(function(byte) {
    if (byte in romContents) {
      romContents[byte] += 1;
    }
  });

  if (maskContents["0"] < romContents["0"]) {
    res
      .status(UNPROCESSABLE)
      .send("Semantic mismatch between romMask.bin and rom.bin");
  }

  // [jf] Add S3 upload logic here
  res.send("testing");
});

app.use(express.static(__dirname));

const listener = app.listen(process.env.PORT, () => {
  console.log("Tenmile is listening on port " + listener.address().port);
});
