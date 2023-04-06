const express = require('express'); 
const app = express();              
const port = process.env.PORT || 5000;
const path = require('path')
const fileUpload = require("express-fileupload");
const fs = require('fs');

app.use(
    fileUpload({
        limits: {
            fileSize: 1024 * 1024 // 1 MB
        },
        abortOnLimit: true
     })
);
function ReadDir(req,res) {
   
    const directoryPath = path.join(__dirname + '/public' , 'images');
    fs.readdir(directoryPath,{withFileTypes: true}, (err, files) => {
        if (err) {
            return console.log('Unable to scan directory: ' + err);
        } 
    let f = files.map(i=>i.name)
    console.log(f);
    res.send(f) 
  })
}

app.get('/read',ReadDir, (req,res) => {
   
  
})
app.get('/', (req, res) => {        
    res.sendFile('index.html', {root: __dirname});      
});

app.post("/upload", (req, res) => {
    console.log(req.files.myfile);
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

app.use(express.static(path.join(__dirname, '/public' )));
app.listen(port, () => {           
    console.log(`Now listening on port ${port}`); 
});