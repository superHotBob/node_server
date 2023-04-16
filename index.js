const express = require('express');
const app = express();
const port = process.env.PORT || 5000;
const path = require('path')
const fileUpload = require("express-fileupload");
const fs = require('fs');
const url = require("url");
const cors = require('cors');
const postgres = require('postgres');
const GreenSMS = require("greensms");
const bodyParser = require("body-parser");
const rateLimit = require('express-rate-limit')
const apiLimiter = rateLimit({
	windowMs: 1 * 60 * 1000, // 1 minutes
	max: 1, // Limit each IP to 3 requests per `window` (here, per 15 minutes)
	standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
	legacyHeaders: false, // Disable the `X-RateLimit-*` headers
})
app.use(bodyParser.urlencoded({
    extended: true
}));
app.use(bodyParser.json());
const dotenv = require("dotenv");
dotenv.config();

const { PGUSER, PGPASSWORD, PASSWORD, USER, USERCALL, PASSWORDCALL } = process.env;
const URL = `postgres://${PGUSER}:${PGPASSWORD}@ep-yellow-mountain-679652.eu-central-1.aws.neon.tech/neondb?sslmode=require&options=project%3Dep-yellow-mountain-679652`;
const client = new GreenSMS({ user: USERCALL, pass: PASSWORDCALL });
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
        city,
        blocked
        from users 
    `;
   
    if(result) {
        res.send(result)
    } else {
        res.send(JSON.stringify({'message': 'error'}))
    }
    
})
app.get('/deletereview', login, async (req,res)=>{
    const result = await sql`
        update orders 
        set review = ''
        where id = ${req.query.id}
    `;
    res.send(result)   
})
app.get('/changeblocked',login, async (req, res)=>{
    const result = await sql`
        update clients 
        set blocked = ${req.query.blocked}
        where phone = ${req.query.tel}
    `;
    res.send('OK')
    const next_result = await sql`
        update users 
        set blocked = ${req.query.blocked}
        where phone = ${req.query.tel}
    `;
    res.send('OK')
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
    
    if(result) {
        res.send(result)
    } else {
        res.send(JSON.stringify({'message': 'error'}))
    }
})
app.get('/orders',login, async (req,res)=>{
    const result = await sql`
        select 
           master,
            client,
            price,
            date_create ,
            review,
            id          
        from orders
    `;
    
    if(result) {
        res.send(result)
    } else {
        res.send(JSON.stringify({'message': 'error'}))
    }
})
app.get('/message',login, async (req,res)=>{
    const result = await sql`
        select *
          
        from ms_admin
    `;
    
    if(result) {
        res.send(result)
    } else {
        res.send(JSON.stringify({'message': 'error'}))
    }
})
app.post('/updatemessage',login, async (req,res)=>{
    const result = await sql`
    update ms_admin
    set ms_answer = ${req.body.answer}
    where id = ${req.body.id}
    `
    res.send("Ok")
})

let calls = {}
const code = 1234
app.post('/call', apiLimiter ,(req,res)=>{    
//     client.call.send({to: req.body.tel})
//    .then((responce) => {
//         calls[req.body.tel] = +responce.code
//         console.log(responce.code)       
//         res.end("OK")   
//     })
    calls[req.body.tel] = 1234
        console.log(calls)
        res.end("OK")    
   
})
app.post('/code',(req,res)=>{
   console.log(calls[req.body.tel] ===  req.body.number)
    if ( calls[req.body.tel] === req.body.number) {
        delete calls === req.body.tel 
        res.status(200).send("OK")
    } else {
        delete calls === req.body.tel 
        res.status(500).send('Bad')
    }
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
    const directoryPath = path.join(__dirname + '/var/data', 'images');
    fs.readdir(directoryPath, { withFileTypes: true }, (err, files) => {
        if (err) {
            return console.log('Unable to scan directory: ' + err);
        }
        let f = files.map(i => i.name)       
        res.send(f)
    })
}
app.get('https://masters-client.onrender.com/read', ReadInDir, (req, res) => {
});

function login(req,res,next) {    
    if( JSON.stringify(req.headers.authorization) === '"' + USER + '"' ) {
        next()
    } else {
       return  res.status(404).send('user not found');
    }
   
}
app.use('/', express.static(__dirname + '/build'));
app.get('/super', (req, res) => {
    res.sendFile('index.html', { root: __dirname });
});
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
    const path = __dirname + "/var/data/" + file.name;

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