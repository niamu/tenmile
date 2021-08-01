const express = require('express')
const fileUpload = require('express-fileupload');
const app = express()

const JSZip = require('jszip');
//const zip = new JSZip();

const fiftyKilobytesInBytes = 50 * 1024;

app.use(fileUpload({
  abortOnLimit: true,
  limits: {
    fileSize: fiftyKilobytesInBytes,
    fields: 1,
    files: 1
  }
}));

app.post('/upload', async function (req, res) {
  if(!req.files) {
    res.send({
      status: false,
      message: "No files sent"
    });
  }
  
  let zipContents = {}
  let zip = await JSZip().loadAsync(req.files.file.data);
  for (let filename of Object.keys(zip.files)) {
    zipContents[filename] = true;
    console.log(filename);
  }
  
  const containsRequiredFiles = (
    'rom.bin' in zip.files &&
    'romMask.bin' in zip.files &&
    'initialState.msgpack' in zip.files
  );
  
  console.log(containsRequiredFiles);
  
  res.send("testing");
});

app.use(express.static(__dirname));

const listener = app.listen(process.env.PORT, () => {
  console.log("Your app is listening on port " + listener.address().port);
});