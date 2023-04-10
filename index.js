const express = require('express');
const app = express();
const port = process.env.PORT || 5000;
const path = require('path')
const fileUpload = require("express-fileupload");
const fs = require('fs');
const url = require("url");
const cors = require('cors');
const postgres = require('postgres');
const bodyParser = require("body-parser");
app.use(bodyParser.urlencoded({
    extended: true
}))


app.use(bodyParser.json())
const dotenv = require("dotenv")
dotenv.config()

const { PGUSER, PGPASSWORD, PASSWORD, USER } = process.env;

const URL = `postgres://${PGUSER}:${PGPASSWORD}@ep-yellow-mountain-679652.eu-central-1.aws.neon.tech/neondb?sslmode=require&options=project%3Dep-yellow-mountain-679652`;

const sql = postgres(URL, { ssl: 'require' });



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
app.get('/masters', login, async (req,res)=>{
    const result = await sql`
        select 
        phone,
        name,
        nikname,
        city
        from users 
    `;
    res.send(result)
})
app.get('/clients',login, async (req,res)=>{
    const result = await sql`
        select 
            phone,
            status,
            name,
            blocked,
            nikname
        from clients
    `;
    res.send(result)
})
app.get('/orders',login, async (req,res)=>{
    const result = await sql`
        select 
           master,
            client,
            price,
            date_create           
        from orders
    `;
    res.send(result)
})
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

function login(req,res,next) {    
    if( JSON.stringify(req.headers.authorization) === '"' + USER + '"' ) {
        next()
    } else {
       return  res.status(404).send('user not found');
    }
   
}
app.use('/', express.static(__dirname + '/build'));
// app.get('/', (req, res) => {
//     res.sendFile('index.html', { root: __dirname });
// });
app.post('/enter', (req,res)=>{
    if(req.body.name === USER && req.body.password === PASSWORD){
        res.status(200).send({"message":"ok"})
    } else {
        res.status(200).send({"message":"Hello bob"})
    }   
})
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