const express = require('express');
const app = express();
const port = process.env.PORT || 5000;
const path = require('path')
const fileUpload = require("express-fileupload");
const fs = require('fs');
const url = require("url");
const cors = require('cors');

app.use(cors({
    origin: '*'
}));

app.use(
    fileUpload({
        limits: {
            fileSize: 1024 * 1024 // 1 MB
        },
        abortOnLimit: true
    })
);
app.use(express.static('public'));
app.use('/images', (req, res) => {
    const request = url.parse(req.url, true);
    const action = request.pathname;
    const filePath = path.join(__dirname,action).split("%20").join(" ");
    fs.readFile(filePath,
        function (err, content) {            
            res.end(content);
        });
});
function ReadInDir(req, res) {
    const directoryPath = path.join(__dirname + '/public', 'images');
    fs.readdir(directoryPath, { withFileTypes: true }, (err, files) => {
        if (err) {
            return console.log('Unable to scan directory: ' + err);
        }
        let f = files.map(i => i.name)       
        res.send(f)
    })
}

app.get('/read', ReadInDir, (req, res) => {
});

app.get('/', (req, res) => {
    res.sendFile('index.html', { root: __dirname });
});

app.post("/upload", (req, res) => {    
    if (!req.files) {
        return res.status(400).send("No files were uploaded.");
    }

    const file = req.files.myfile;
    const path = __dirname + "/public/images/" + file.name;

    file.mv(path, (err) => {
        if (err) {
            return res.status(500).send(err);
        }
        return res.send({ status: "success", path: path });
    });
});

app.use(express.static(path.join(__dirname, '/public')));
app.listen(port, () => {
    console.log(`Now listening on port ${port}`);
});