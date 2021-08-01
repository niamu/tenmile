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
const INSUFFICIENT_STORAGE = 507 // HTTP 507 Insufficient Storage

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

// curl -F "file=@filename.png" https://tenmile.quote.games/upload
app.post("/upload", async function(req, res) {
  // [jf] FIXME: This "files" interface sucks, just do it directly
  if (!req.files) {
    res.status(UNPROCESSABLE).send("No files sent");
  }

  const data = req.files.file.data;
  const zip = await JSZip().loadAsync(data);

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

  if (maskContents["0"] > romContents["0"]) {
    res
      .status(UNPROCESSABLE)
      .send("Semantic mismatch between romMask.bin and rom.bin");
  }

  const fileId = xid.next();
  const filename = `${fileId}.png`;

  s3.upload({
    Bucket: "tenmile",
    ACL: "public-read",
    Key: filename,
    Body: data
  }, function(err, data) {
    if(err) {
      res.status(INSUFFICIENT_STORAGE).send("S3 is unavailable");
    }
    res.send({"url": data.Location});  
  });
});

app.use(express.static(__dirname));

const listener = app.listen(process.env.PORT, () => {
  console.log("Tenmile is listening on port " + listener.address().port);
});
