const express = require("express");
const fileUpload = require("express-fileupload");
const app = express();

const JSZip = require("jszip");
//const zip = new JSZip();

const fiftyKilobytesInBytes = 50 * 1024;

app.use(
  fileUpload({
    abortOnLimit: true,
    limits: {
      fileSize: fiftyKilobytesInBytes,
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

  // error if required files are not in zip
  
  let rom = await zip.file('rom.bin').async("uint8array");
  let romMask = await zip.file('romMask.bin').async("uint8array");

  console.log(rom.length);
  console.log(romMask.length);
  // error if lengths of rom and romMask do not match
  
  
  let contents = {}
  romMask.map(function(byte) {
    if(!(byte in contents)) {
      contents[byte] = 1;
    }
    contents[byte] += 1;
  });
  
  console.log(containsRequiredFiles);
  console.log(contents);
  // error if rom mask has more than 2 keys
  console.log(Object.keys(contents).length);
  
  // error if percentage of ROM mask is about a threshold
  
  //error if number of 0s in ROM Mask is < number of 0s in ROM
  
  res.send("testing");
});

app.use(express.static(__dirname));

const listener = app.listen(process.env.PORT, () => {
  console.log("Your app is listening on port " + listener.address().port);
});
