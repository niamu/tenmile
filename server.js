const express = require("express");
const fileUpload = require("express-fileupload");
const app = express();

const UNPROCESSABLE = 422; // HTTP 422 Unprocessable Entity

const JSZip = require("jszip");
//const zip = new JSZip();

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

  let zip = await JSZip().loadAsync(req.files.file.data);

  if (
    !(
      "rom.bin" in zip.files &&
      "romMask.bin" in zip.files &&
      "initialState.msgpack" in zip.files
    )
  ) {
    res.status(UNPROCESSABLE).send("Required files are missing");
  }

  let rom = await zip.file("rom.bin").async("uint8array");
  let romMask = await zip.file("romMask.bin").async("uint8array");
  if (rom.length != romMask.length) {
    res.status(UNPROCESSABLE).send("rom.bin and romMask.bin length mismatch");
  }

  let maskContents = {};
  romMask.map(function(byte) {
    if (!(byte in maskContents)) {
      maskContents[byte] = 1;
    }
    maskContents[byte] += 1;
  });

  if (Object.keys(maskContents).length != 2) {
    res.status(UNPROCESSABLE).send("romMask.bin contains invalid data");
  }

  let byteRatio = maskContents["1"] / (maskContents["1"] + maskContents["0"]);
  if (byteRatio > maximumByteRatioInQuote) {
    res.status(UNPROCESSABLE).send("Too many valid bytes included in rom.bin");
  }

  let romContents = {};
  rom.map(function(byte) {
    if (!(byte in romContents)) {
      romContents[byte] = 1;
    }
    romContents[byte] += 1;
  });

  console.log(romContents);
  // HTTP 422 Semantic mismatch between romMask.bin and rom.bin

  res.send("testing");
});

app.use(express.static(__dirname));

const listener = app.listen(process.env.PORT, () => {
  console.log("Your app is listening on port " + listener.address().port);
});
