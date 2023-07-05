const express = require('express');
const app = express();
const port = process.env.PORT || 5000;
const path = require('path')
const fileUpload = require("express-fileupload");
const multer = require('multer')
const sharp = require("sharp");
const fs = require('fs');
const url = require("url");
const IP = require('ip');
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
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
const dotenv = require("dotenv");
dotenv.config();

const { PGUSER, PGPASSWORD, PASSWORD, USER, USERCALL, PASSWORDCALL } = process.env;
const URL = `postgres://${PGUSER}:${PGPASSWORD}@ep-yellow-mountain-679652.eu-central-1.aws.neon.tech/neondb?sslmode=require&options=project%3Dep-yellow-mountain-679652`;
const client = new GreenSMS({ user: USERCALL, pass: PASSWORDCALL });
const sql = postgres(URL, { ssl: 'require' });

app.use(cors({ origin: '*' }));
app.get('/var/data/*', (req, res) => {
    let pat = __dirname + req.path   
    res.sendFile(pat)
})
app.use(express.static('public'));

app.get('/find_master', login, async (req, res) => {
    const result = await sql`
        select 
        phone,
        name,
        nikname,
        city,
        blocked
        from users 
        where phone = ${req.query.phone} and blocked = '0'
    `;
    res.send(result)
})
app.get('/locked', login, async (req, res) => {
    const result = await sql`
        select 
        phone,     
        blocked date
        from clients 
        where blocked != '0'
    `;
    res.send(result)
})
app.get('/deletereview', login, async (req, res) => {
    const result = await sql`
        update orders 
        set review = ''
        where id = ${req.query.id}
    `;
    res.send(result)
})
app.get('/reviews', login, async (req, res) => {
    const result = await sql`
        select
        date_order,
        review,
        stars,
        client_name,
        client
        from orders
        where master = ${req.query.name} and review is not null
    `;
    res.send(result)
})

app.get('/blocked', login, async (req, res) => {
    const update_clients = await sql`
        update clients 
        set blocked = CURRENT_DATE
        where phone = ${req.query.phone}
    `;
   
    if (update_clients.length === 0) {
        res.status(500).send({error: 'Error'})
    } else {
        const update_users = await sql`
        update users 
        set blocked = CURRENT_DATE
        where phone = ${req.query.phone}
        `;
        if (update_users.length === 0) {
            res.status(500).send({error: 'Error'})
        }
        res.send('OK')
    }
})
app.get('/unblocked', login, async (req, res) => {
    const update_clients = await sql`
        update clients 
        set blocked = '0'
        where phone = ${req.query.phone}
    `;
   
    if (update_clients.length === 0) {
        res.status(500).send({error: 'Error'})
    } else {
        const update_users = await sql`
        update users 
        set blocked = '0'
        where phone = ${req.query.phone}
        `;
        if (update_users.length === 0) {
            res.status(500).send({error: 'Error'})
        }
        res.send('OK')
    }
})
app.get('/countclients', login, async (req, res) => {
    const result = await sql`
        select count(*)
        from clients    `
    res.send(result[0].count)
})
app.get('/countorders', login, async (req, res) => {
    const result = await sql`
        select count(*)
        from orders    `
    res.send(result[0].count)
})
app.get('/countmasters', login, async (req, res) => {
    const result = await sql`
        select count(*)
        from users `
    res.send(result[0].count)
})
app.get('/clients', login, async (req, res) => {
    const result = await sql`
        select 
            phone,
            status,
            name,
            blocked,
            nikname,
            client_password,
            registration
        from clients
        ORDER BY 
            phone	
        limit ${req.query.limit} offset ${req.query.offset}
    `;
    if (result) {
        res.send(result)
    } else {
        res.send(JSON.stringify({ 'message': 'error' }))
    }
})
app.get('/find_client', login, async (req, res) => {
    const phone = +req.query.phone
    const nikname = req.query.nikname
    const result = await sql`
        select 
            phone,
            status,
            name,
            blocked,
            nikname,
            client_password,
            registration
        from clients       
        where 
            phone::text like ${phone + '%'}
            or nikname like ${nikname + '%'}
           
    `;
    if (result) {
        res.send(result)
    } else {
        res.send(JSON.stringify({ 'message': 'error' }))
    }
})
// app.get('/orders',login, async (req,res)=>{
//     const result = await sql`
//         select 
//            master,
//             client,
//             price,
//             date_create ,
//             review,
//             id          
//         from orders
//     `;    
//     if(result) {
//         res.send(result)
//     } else {
//         res.send(JSON.stringify({'message': 'error'}))
//     }
// })
app.get('/message', login, async (req, res) => {
    const result = await sql`
    select * from (
        select distinct on ( chat ) *         
        from  adminchat       
        where sendler_nikname  !=  'администратор'        
        order by chat, ms_date desc
      ) chat
    `;
    if (result) {
        res.send(result)
    } else {
        res.send(JSON.stringify({ 'message': 'error' }))
    }
})
app.get('/chat', login, async (req, res) => {
    const result = await sql`
    select * from  adminchat       
        where sendler_nikname  =  ${req.query.nikname}   or  recipient_nikname =   ${req.query.nikname} 
       
    `;
    if (result) {
        res.send(result)
    } else {
        res.send(JSON.stringify({ 'message': 'error' }))
    }
})
app.get('/deletemaster', login, async (req, res) => {
    const delete_master = await sql`
        delete from users
        where nikname = ${req.query.nikname}
    `;
    console.log('delete_master')
    const delete_client = await sql`
    delete from clients
    where nikname = ${req.query.nikname}
    `;
    console.log('delete_client')
    const delete_services = await sql`
    delete from services
    where nikname = ${req.query.nikname}
    `
    const delete_schedule = await sql`
    delete from schedule
    where nikname = ${req.query.nikname}
    `
    fs.rmSync(__dirname + `/var/data/${req.query.nikname}`, { recursive: true });
    console.log('delete_folder')
    res.send("Delete ok")
})
app.get('/deleteclientfolder', (req, res) => {
    fs.rmSync(__dirname + `/var/data/${req.query.nikname}`, { recursive: true });
    console.log('delete client folder')
    res.send("Delete ok")
})

app.get('/createclientfolder', (req, res) => {
    fs.access(__dirname + `/var/data/${req.query.dir}`, (err) => {
        if (err) {
            fs.mkdirSync(__dirname + `/var/data/${req.query.dir}`);
            fs.copyFile((__dirname + '/main.jpg'), (__dirname + `/var/data/${req.query.dir}/main.jpg`), (error) => {
                if (error) {
                    throw error
                } else {
                    console.log('File has been moved to another folder.')
                }
            })

            res.send('Католог создан')
        } else {
            res.send('Dir is good')
        }
    });
})
app.post('/answer_message', login, async (req, res) => {
    let dt = Date.now()
    const result = await sql`
    insert into adminchat (recipient,recipient_nikname,sendler,sendler_nikname,ms_text,ms_date,chat) 
    values (
      ${req.body.recipient},
      ${req.body.recipient_nikname},
      'администратор',
      'администратор',  
      ${req.body.ms_text},
      ${dt},
      ${req.body.chat}
    )  
    `
    res.send("Сообщение изменено")
})
app.post('/message', login, async (req, res) => {
    let dt = Date.now()
    const result = await sql`
    insert into chat (recipient,recipient_nikname,sendler,sendler_nikname,ms_text,ms_date,chat,read) 
    values (
      ${req.body.recipient},
      ${req.body.recipient_nikname},
      'администратор',
      'администратор',  
      ${req.body.ms_text},
      ${dt},
      0,
      'false'
    )  
    `
    res.send("Сообщение добавлено")
})

app.get('/getsertificats', (req, res) => {
    let sertificats = []
    fs.readdirSync(__dirname + '/var/data/' + req.query.dir).forEach(file => {
        file.includes('sertificat') && file.includes('jpg') ? sertificats.push(file) : null;
    });
    res.send(sertificats)
})
app.get('/getlists', (req, res) => {
    let lists = []
    fs.readdirSync(__dirname + '/var/data/' + req.query.dir).forEach(file => {
        file.includes('list') && file.includes('jpg') ? lists.push(file) : null;
    });
    res.send(lists)
})
app.get('/deletesertificat', (req, res) => {
    fs.unlink(__dirname + '/var/data/' + req.query.name + '/' + req.query.sertificat, (err) => {
        if (err) {
            throw err;
        }
        res.send('Ok')
    });
})
app.get('/deletelist', (req, res) => {
    fs.unlink(__dirname + '/var/data/' + req.query.name + '/' + req.query.list, (err) => {
        if (err) {
            throw err;
        }
        res.send('Ok')
    });
})

app.get('/ip', function (req, res) {
    const ipAddress = IP.address();
    res.send(`<h3>My ip: ${ipAddress}</h3>`);
});
app.get('/readtext', (req, res) => {
    let new_file = (req.query.file).replace('jpg', 'txt')
    if (fs.existsSync(__dirname + '/var/data/' + new_file)) {
        fs.readFile(__dirname + '/var/data/' + new_file, 'utf8', (err, data) => {
            if (err) {
                console.log("File not found");
                res.send('');
            }
            res.send(data);
        });
    } else {
        res.send('')
    }
})
app.post('/createtag', (req, res) => {
    console.log(req.query.name, req.body)
    let new_fle = (req.body.name).replace('jpg', 'txt')
    fs.writeFile(__dirname + '/var/data/' + req.query.name + '/' + new_fle, req.body.text, function (err) {
        if (err) throw err;
        console.log('File is created successfully.');
    });
    res.send("Ok")
})

let calls = {}
const code = 1234
app.post('/call', apiLimiter, (req, res) => {
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

app.post('/code', (req, res) => {
    console.log(calls[req.body.tel] === req.body.number)
    if (calls[req.body.tel] === req.body.number) {
        delete calls === req.body.tel
        res.status(200).send("OK")
    } else {
        delete calls === req.body.tel
        res.status(500).send('Bad')
    }
})
app.use('/var/data/*', (req, res) => {
    const request = url.parse(req.url, true);
    const action = request.pathname;
    const filePath = path.join(__dirname, action).split("%20").join(" ");
    fs.readFile(filePath,
        function (err, content) {
            res.end(content);
        });
});
// app.get('/renamefolder', (req,res) => {
//     const currPath = '/var/data/' + req.query.dir
//     const newPath = '/var/data/' + req.query.dir.replace('client','master')

//     fs.rename(__dir + currPath, __dir + newPath, function(err) {
//     if (err) {
//         console.log(err)
//     } else {
//         console.log("Successfully renamed the directory.")
//     }
//     })
// })


function login(req, res, next) {
    if (JSON.stringify(req.headers.authorization) === '"' + USER + '"') {
        next()
    } else {
        return res.status(404).send('user not found');
    }

}
app.use('/', express.static(__dirname + '/build'));

app.post('/enter', (req, res) => {
    if (req.body.name === USER && req.body.password === PASSWORD) {
        res.status(200).send({ "message": "ok" })
    } else {
        res.status(200).send({ "message": "Hello bob" })
    }
})

// async function getMetadata(req) {
//     console.log(req.file)
//     // const metadata = await sharp(req.file).metadata();
//     // console.log(metadata);
//   }
const storageConfig = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, `var/data/${req.query.name}`);
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname);
    }
});
const files = []
app.use(multer({ storage: storageConfig }).single("file"));
app.post("/upl", (req, res) => {
    if (!req.file) {
        res.send("No file upload")
    } else {
        files.push(req.query.name + '/' + req.file.filename)
        res.send('req.file.filename')
    }
    // const file = req.files.image;
    // const path = __dirname + "/var/data/" + file.name;

    // file.mv(path, (err) => {
    //     if (err) {
    //         return res.status(500).send(err);
    //     }
    //     return res.send({ status: "success", path: path });
    // });
});
app.get('/filesformoderate', (req, res) => {
    res.send(files)
})

app.use(express.static(path.join(__dirname, '/public')));
app.use((req, res, next) => {
    res.status(404).send(
        "<h1 style='text-align: center;margin: 200px auto' >Page not found on the server</h1>")
});
app.listen(port, () => {
    console.log(`Now listening on port ${port}`);
});