const express = require("express");
const expressMd = require("express-md");
const fileUpload = require("express-fileupload");
const AWS = require("aws-sdk");

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

const app = express();

const UNPROCESSABLE = 422; // HTTP 422 Unprocessable Entity
const INSUFFICIENT_STORAGE = 507; // HTTP 507 Insufficient Storage

const MAXIMUM_FILE_SIZE_IN_BYTES = 1 * 1024 * 1024;

app.use(
  fileUpload({
    abortOnLimit: true,
    limits: {
      fileSize: MAXIMUM_FILE_SIZE_IN_BYTES,
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

  let data = req.files.file.data;
  let filename = req.files.file.name;

  s3.upload(
    {
      Bucket: "tenmile",
      ACL: "public-read",
      Key: filename,
      Body: data
    },
    function(err, data) {
      if (err) {
        res.status(INSUFFICIENT_STORAGE).send("S3 is unavailable");
      }
      res.send({ url: data.Location });
    }
  );
});

app.get("/play", async function(req, res) {
  res.sendFile(__dirname + "/public/player.html");
});

app.get("/view", async function(req, res) {
  res.sendFile(__dirname + "/public/player.html");
});

let mdRouter = expressMd({
  dir: __dirname + "/public",
  url: "/"
});

app.use(express.static("public"));
app.use(mdRouter);

const listener = app.listen(process.env.PORT, () => {
  console.log(
    "Tenmile service is listening on port " + listener.address().port
  );
});
