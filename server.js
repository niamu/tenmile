const express = require('express')
const fileUpload = require('express-fileupload');
const app = express()

app.use(fileUpload());

app.post('/upload', function (req, res) {
  if(!req.files) {
    res.send({
      status: false,
      message: "No files sent"
    });
  }
  console.log(req.files);
  
  res.send("testing");
});

app.use(express.static(__dirname));

const listener = app.listen(process.env.PORT, () => {
  console.log("Your app is listening on port " + listener.address().port);
});