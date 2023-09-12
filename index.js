const express = require('express');
const app = express();
const port = process.env.PORT || 5000;
const path = require('path')
const multer = require('multer')
const fs = require('fs');
const url = require("url");
const IP = require('ip');
const cors = require('cors');
const postgres = require('postgres');
const GreenSMS = require("greensms");
const bodyParser = require("body-parser");
const rateLimit = require('express-rate-limit');
const Pool = require('pg').Pool;
const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minutes
    max: 3, // Limit each IP to 3 requests per `window` (here, per 15 minutes)
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

const clientdb = new Pool({
    user: 'client',
    host: '5.35.5.23',
    database: 'postgres',
    password: 'client123',
    port: 5432,
})
clientdb.connect(function (err) {
    if (err) {
        console.log(err)
    }
    console.log("Connected!");
});

app.use(cors({ origin: '*' }));
app.use(express.static('public'));




app.get('/find_master', login, async (req, res) => {
    const { rows } =  await clientdb.query(`
        select 
        phone,
        name,
        nikname,
        city,
        blocked
        from "masters" 
        where phone = $1 and blocked = '0'
    `,[req.query.phone]);
    res.send(rows)
})

app.get('/locked', login, async (req, res) => {
    const { rows } = await clientdb.query(`
        select phone, blocked date
        from "clients" 
        where "blocked" != '0'
    `);
   
    res.send(rows)
})



app.get('/deletereview', login, async (req, res) => {
    const { rows } = await clientdb.query(`
        update "orders" 
        set review = null,
        set stars = null
        where id = $1
    `,[req.query.id]);
   
    res.send(rows)
})

app.get('/get_entres', login, async (req, res) => {  
    const query = `SELECT * FROM "history" WHERE "phone" = $1`;
    const { rows } = await clientdb.query(query, [req.query.phone]);   
    res.send(rows)
});




app.get("/endedorders", login, async (req, res) => {
    const month = (new Date()).getMonth() + 1
    const { rows } = await clientdb.query(`
    select COUNT(*)
    from "orders"
    where "order_month" < $1
    `,[month]);   
    res.send(rows[0].count)
})

app.get('/reviews', login, async (req, res) => {
    const { rows } = await clientdb.query(`
        select
            date_order,
            review,
            stars,
            client_name,
            client,
            master,
            master_name,
            id
        from "orders"
        where ( "master" = $1 or "client" = $1 ) and review <> '0'
    `,[req.query.name]);
  
    res.send(rows)
})

app.get('/blocked', login, async (req, res) => {
    const { user } = await clientdb.query(`
        update "clients" 
        set "blocked" = CURRENT_DATE
        where "phone" = $1 
        returning nikname , status    
    `,[req.query.phone]);
    const nikname = user[0].nikname
    const status = user[0].status

    // if (fs.existsSync(__dirname + `/var/data/${nikname}`)) {
    //     fs.rmdir(__dirname + `/var/data/${nikname}`, { recursive: true }, err => {
    //         if (err) {
    //             throw err
    //         }
    //         console.log('Каталог удалён')

    //     })
    // }

    if (status === 'client') {
        await clientdb.query(`
            delete from "adminchat"
            where "sendler_nikname" = $1 or "recipient_nikname" = $1
        `,[nikname]);
        await clientdb.query(`
            delete from "chat"
            where "sendler_nikname" = $1} or "recipient_nikname" = $1
        `,[nikname]);
        res.send("Профиль удалён")

    } else {
        await clientdb.query(`
            delete from "masters"
            where "nikname" = $1
        `,[nikname]);
        await clientdb.query(`
            delete from "services"
            where "nikname" = $1
        `,[nikname]);
        await clientdb.query(`
            delete from "schedule"
            where "nikname" = $1
        `,[nikname]);
        await clientdb.query(`
            delete from  "images"
            where "nikname" = $1
        `,[nikname]);
        await clientdb.query(`
            delete from "adminchat"
            where "sendler_nikname" = $1 or "recipient_nikname" = $1
            `,[nikname]);
        await clientdb.query(`
            delete from "chat"
            where "sendler_nikname" = $1 or "recipient_nikname" = $1
            `,[nikname]);
       
        res.send("Профиль удален")
    }
})

app.get('/changerating', login, async (req, res) => {
    await clientdb.query(`
        update "clients" 
        set "rating" = $1
        where "nikname" = $1
    `,[req.query.rating,req.query.name]);
   
    res.send('Ok')
})
app.get('/setreadmessage', login, async (req, res) => {
    await clientdb.query(`
        update "adminchat" 
        set "read" = 't'
        where "chat" = $1 and "ms_date" = $2
    `,[req.query.chat,req.query.date]);
   
    res.send('OK')
})
app.get('/deleteblocked', login, async (req, res) => {
    await clientdb.query(`
        delete from "clients"         
        where "phone" = $1
    `,[req.query.phone]);
   
    res.send('Заблокированый пользователь удален')
})

app.get('/countclients', login, async (req, res) => {   
    let { rows } =  await clientdb.query("select count(*) from clients  where status = 'client'")    
    res.send(rows[0].count)
})

app.get('/countorders', login, async (req, res) => {   
    const month = (new Date()).getMonth() + 1
    const { rows } =  await clientdb.query(`
        select count(*)
        from "orders" 
        where "order_month"  >= $1   
     `,[month]);   
    res.send(rows[0].count)
})

app.get('/countmasters', login, async (req, res) => {  
    const  { rows } =  await clientdb.query("select count(*) from masters");  
    res.send(rows[0].count)
})

app.get('/get_nikname', login, async (req, res) => {
    const { rows } =  await clientdb.query(`
        select nikname 
        from "clients" 
        where "phone" = $1 
    `,[req.query.phone]);
    
    res.send(rows[0].nikname)

})


app.get('/clients', login, async (req, res) => {
   
    const { rows } = await clientdb.query(`
        select 
            phone,
            status,
            name,
            blocked,
            nikname,
            client_password,
            registration,
            rating
        from "clients"
        where "blocked" = '0'
        ORDER BY 
            registration	
        limit $1 offset $2
    `,[req.query.limit,req.query.offset]);
    if (rows) {
       
        res.send(rows)
    } else {
       
        res.send(JSON.stringify({ 'message': 'error' }))
    }
})

app.get('/find_client', login, async (req, res) => {
    const phone = +req.query.phone
    const nikname = req.query.nikname
    const { rows } =  await clientdb.query(`
        select 
            phone,
            status,
            name,
            blocked,
            nikname,
            client_password,
            registration,
            rating
        from "clients"       
        where  ( "phone"::text like $1 or "nikname" like $2) and "blocked" = '0'           
    `,[phone + '%',nikname + '%']);

    if (rows) {      
       res.send(rows)
    } else {       
        res.send(JSON.stringify({ 'message': 'error' }))
    }
})
app.get('/find_all_images', login, async (req, res) => {
    if (req.query.service === 'все') {
        const { rows } =  await clientdb.query("select * from images");
        
        res.send(rows)
    } else {
        const result = await clientdb.query(`
            select *          
            from "images" 
            where "service" = $1         
        `,[req.query.service]);
       
        res.send(result)
    }

})
app.get('/message', login, async (req, res) => {
    const {rows: result } = await clientdb.query(`
    select chat, recipient, ms_date, sendler, read, recipient_nikname, sendler_nikname from (
        select distinct on ( chat ) *         
        from  "adminchat"  
        where (recipient != 'master' or recipient !='client' or recipient != 'all')  and (recipient = 'администратор' and read = 'true')  or   (sendler = 'администратор' and read = 'false')       
        order by chat, ms_date desc
      ) chat
      order by  ms_date desc
    `,[]);
    const { rows: result_read } = await clientdb.query(`
    select chat, recipient, ms_date, sendler, read, recipient_nikname, sendler_nikname from (
        select distinct on ( chat ) *         
        from  "adminchat"  
        where "recipient" = 'администратор' and read != 'true'           
        order by chat, ms_date desc
      ) chat
      order by  ms_date desc
    `,[]);


    if (result) {
        res.send(result_read.concat(result))
    } else {
        res.send(JSON.stringify({ 'message': 'error' }))
    }
})

app.get('/admin_user_dialog', login, async (req, res) => {
    const { rows } = await clientdb.query(`
        select * from  adminchat       
        where chat  =  +$1       
    `,[req.query.chat]);
    if (rows) {
        res.send(rows)
    } else {
        res.send(JSON.stringify({ 'message': 'error' }))
    }
})

app.get('/delete_image', login, async (req, res) => {
    await sql`
        delete from images
        where id= ${req.query.id}
    `;
    fs.unlink(`/data/images/${req.query.id}` + '.jpg', (err) => {
        if (err) {
            throw err;
        }
        res.send("Delete successfully")
    })
})

app.get('/deleteuser', async (req, res) => {
    const nikname = req.query.nikname;
    if (fs.existsSync(__dirname + `/var/data/${nikname}`)) {
        fs.rmdir(__dirname + `/var/data/${nikname}`, { recursive: true }, err => {
            if (err) {
                throw err
            }
            console.log('Каталог удалён')

        })
    }


    if (req.query.status === 'client') {
       

        await clientdb.query(`DELETE from "clients" WHERE "nikname" = $1`,[nikname]);
        // await sql`
        //     delete from clients
        //     where nikname = ${nikname}
        // `;
        await clientdb.query(`DELETE from "adminchat" WHERE "sendler_nikname" = $1 or recipient_nikname = $1`,[nikname]);
        // await sql`
        //     delete from adminchat
        //     where sendler_nikname = ${nikname} or recipient_nikname = ${nikname}
        // `;
        await clientdb.query(`DELETE from "chat" WHERE "sendler_nikname" = $1 or recipient_nikname = $1`,[nikname]);
        // await sql`
        //     delete from chat
        //     where sendler_nikname = ${nikname} or recipient_nikname = ${nikname}
        // `;
        res.send("Профиль удалён")
        return;
    } else {
        await clientdb.query(`DELETE from "masters" WHERE "nikname" = $1`,[nikname]);
        await sql`
            delete from masters
            where nikname = ${nikname}
        `;
        await clientdb.query(`DELETE from "clients" WHERE "nikname" = $1`,[nikname]);
        await sql`
            delete from clients
            where nikname = ${nikname}
        `;
        await clientdb.query(`DELETE from "services" WHERE "nikname" = $1`,[nikname]);
        await sql`
            delete from services
            where nikname = ${nikname}
        `;
        await clientdb.query(`DELETE from "schedule" WHERE "nikname" = $1`,[nikname]);
        await sql`
            delete from schedule
            where nikname = ${nikname}
        `;
        await clientdb.query(`DELETE from "images" WHERE "nikname" = $1`,[nikname]);
        await sql`
            delete from  images
            where nikname = ${nikname}
        `;
        await clientdb.query(`DELETE from "adminchat" WHERE "nikname" = $1`,[nikname]);
        await sql`
            delete from adminchat
            where sendler_nikname = ${nikname} or recipient_nikname = ${nikname}
        `;
        await clientdb.query(`DELETE from "chat" WHERE "nikname" = $1`,[nikname]);
        await sql`
            delete from chat
            where sendler_nikname = ${nikname} or recipient_nikname = ${nikname}
        `;

        res.send("Профиль удален")
    }
})

app.get('/deleteclientfolder', (req, res) => {
    fs.rmdir(__dirname + `/var/data/${req.query.nikname}`, { recursive: true }, err => {
        if (err) {
            throw err
        }
        console.log('Папка клиента удалена')
        res.send(`Folder ${req.query.nikname}  deleted ok`)
    })

})


app.get('/createclientfolder',  (req, res) => {
    // fs.access(__dirname + `/var/data/${req.query.dir}`, (err) => {
    //     if (err) {
    //         fs.mkdirSync(__dirname + `/var/data/${req.query.dir}`);
    console.log('ssss',req.query.dir)
            fs.copyFile((__dirname + '/main.jpg'), (`/data/images/${req.query.dir}.jpg`), (error) => {
                if (error) {
                    throw error
                } else {
                    console.log('File been created')
                }
            })

    //         res.send('Католог создан')
    //     } else {
    //         res.send('Dir is good')
    //     }
    // });
})

app.get('/rename_master_icon', (req, res) => {
    fs.rename('/data/images/' + req.query.oldname + '.jpg','/data/images/' + req.query.newname + '.jpg', function (err) {
        if (err) {
            console.log('Ошибка переименования файла')
        } else {
            console.log("Successfully renamed the file.")
            res.send('Successfully renamed the file.')
        }
    })
})

app.post('/answer_message', login, async (req, res) => {
    let dt = Date.now()
    await clientdb.query(`
        insert into "adminchat" (recipient,recipient_nikname,sendler,sendler_nikname,ms_text,ms_date,chat) 
        values ($1,$2,$3,$3,$4,$5,$6)  
    `,[req.body.recipient,req.body.recipient_nikname,'администратор',req.body.ms_text,dt,req.body.chat]);
    res.send("Сообщение изменено")
})

app.post('/message', login, async (req, res) => {
    let dt = Date.now()
    const result = await sql`
    insert into adminchat (recipient,recipient_nikname,sendler,sendler_nikname,ms_text,ms_date,chat,read) 
    values (
      ${req.body.recipient},
      ${req.body.recipient_nikname},
      'администратор',
      'администратор',  
      ${req.body.ms_text},
      ${dt},
      ${req.body.chat},
      'false'
    )  
    `
    res.status(200).send({ text: "Сообщение добавлено" })
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
        file.includes('jpg') && !file.includes('main') && !file.includes('sertificat') ? lists.push(file) : null;
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
    res.end("OK")

})

app.post('/code', (req, res) => {

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
    console.log(req.headers.authorization === USER)
    if (req.headers.authorization === USER ) {
        next()
    } else {
        return res.status(404).send('not login');
    }

}
app.use('/', express.static(__dirname + '/build'));

app.post('/enter', (req, res) => {
    if (req.body.name === 'master' && req.body.password === 'place') {
        res.status(200).send({ "message": "ok" })
    } else {
        res.status(200).send({ "message": "Hello bob" })
    }
})


const storageConfig = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, '../../data/images');
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
    // const path = "../../data/images/" + req.file.originalname;

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
app.get('*', (req, res) => {
    res.sendFile(path.resolve(__dirname, 'build', 'index.html'));
});
// app.use((req, res, next) => {

//     res.status(404).send(
//         "<h1 style='text-align: center;margin: 200px auto' >Page not found on the server</h1>")
// });
app.listen(port, () => {
    console.log(`Now listening on port ${port}`);
});