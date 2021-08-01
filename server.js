const express = require("express");
const fileUpload = require("express-fileupload");
const app = express();

const UNPROCESSABLE_ENTITY = 422

const JSZip = require("jszip");
//const zip = new JSZip();

const fiftyKilobytesInBytes = 50 * 1024;
const maximumFileSizeInBytes = fiftyKilobytesInBytes;

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
  
  const containsRequiredFiles =
    "rom.bin" in zip.files &&
    "romMask.bin" in zip.files &&
    "initialState.msgpack" in zip.files;
  if(!containsRequiredFiles) {
    res.status(UNPROCESSABLE_ENTITY).send('Required files are not in the playable quote');
  }
  
  let rom = await zip.file('rom.bin').async("uint8array");
  let romMask = await zip.file('romMask.bin').async("uint8array");
  if(rom.length != romMask.length) {
    res.status(UNPROCESSABLE_ENTITY).send('Lengths of rom.bin and romMask.bin do not match');
  }
  
  let contents = {}
  romMask.map(function(byte) {
    if(!(byte in contents)) {
      contents[byte] = 1;
    }
    contents[byte] += 1;
  });
  
  console.log(containsRequiredFiles);
  console.log(contents);
  // HTTP 422 Invalid romMask.bin
  console.log(Object.keys(contents).length);
  
  // HTTP 422 Too many valid bytes included in rom.bin
  
  // HTTP 422 Semantic mismatch between romMask.bin and rom.bin
  
  res.send("testing");
});

app.use(express.static(__dirname));

const listener = app.listen(process.env.PORT, () => {
  console.log("Your app is listening on port " + listener.address().port);
});
