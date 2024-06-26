const express = require('express');
const app = express();
const path = require('path')
const multer = require('multer')
const fs = require('fs');
const sharp = require('sharp');
const rateLimit = require('express-rate-limit')
const cors = require('cors');
const GreenSMS = require("greensms");
const bodyParser = require("body-parser");
const { Client } = require('pg');
const dotenv = require("dotenv");
dotenv.config();
const services = ['все','маникюр', 'прически','педикюр', 'макияж', 'массаж', 'барбер', 'ресницы', 'брови', 'депиляция','окрашивание','чистка','стрижка']
const limiter = rateLimit({
	windowMs: 5 * 60 * 1000, // 5 minutes
	max: 3, // Limit each IP to 100 requests per `window` (here, per 5 minutes)
	standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
	message: {message: `Вы исчерпали лимит попыток, попробуйте через 5 минут`},
    keyGenerator: (req,res) => req.body.ip,
    handler: (req, res, next, options) =>
		res.send({message: 'Вы исчерпали лимит попыток, попробуйте через 5 минут', statusCode: 429})    
});

const db = {
    user: 'client',
    host: '5.35.5.23',
    database: 'postgres',
    password: 'client123',
    port: 5432,
}
let secret_key = '';

const { USERCALL, PASSWORDCALL } = process.env;
const client = new GreenSMS({ user: USERCALL, pass: PASSWORDCALL });

app.use(cors({ origin: '*' }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded());
app.use(express.static('public'));

app.get('/find_master', login, async (req, res) => {
    const client = new Client(db)
    await client.connect()
    const { rows } = await client.query(`
        select phone, name, nikname, blocked
        from "clients" 
        where phone = $1 and blocked = '0'
    `, [req.query.phone]);
    await client.end()
    res.send(rows)
});
app.get('/locked', login, async (req, res) => {
    const client = new Client(db)
    await client.connect()
    const { rows } = await client.query(`
        select phone, blocked date
        from "clients" 
        where "blocked" != '0'
    `);
    await client.end()
    res.send(rows)
});

app.get('/deletereview', login, async (req, res) => {
    const client = new Client(db)
    await client.connect()
    const { rows } = await client.query(`
        update "orders" 
        set review = null,
        set stars = null
        where id = $1
    `, [req.query.id]);
    await client.end()
    res.send(rows)
});
app.get('/get_entres', login, async (req, res) => {
    const client = new Client(db)
    await client.connect()
    const query = `SELECT * FROM "history" WHERE "phone" = $1 order by "date_enter" DESC`;
    const { rows } = await client.query(query, [req.query.phone]);
    await client.end()
    res.send(rows)
});

app.get('/countmasters', login, async (req, res) => {
    const client = new Client(db)
    await client.connect()
    const { rows: masters } = await client.query("select count(*) from masters");
    const { rows: clients } = await client.query("select count(*) from clients  where status = 'client'");
    const month = (new Date()).getMonth() + 1;
    const year = (new Date()).getFullYear();
    const day = (new Date()).getDate();

    const { rows: end_orders } = await client.query(`
        select count(*) from "orders" 
        where ("order_month" < $1 and "year" = $2) or "year" < $2
        `, [month, year]
    );

    const { rows: orders } = await client.query('select count(*) from orders');
    await client.end();
    res.json({
        masters: masters[0].count,
        clients: clients[0].count,
        endorders: end_orders[0].count,
        activeorders: orders[0].count - end_orders[0].count
    })
});

app.get('/reviews/:uid', login, async (req, res) => {
    const client = new Client(db)    
    await client.connect()
    const { rows } = await client.query(`
        select
            date_order,
            review,
            year,
            order_month,
            stars,
            client_name,
            client,
            master,
            master_name,
            id
        from "orders"
        where ( "master" = $1 or "client" = $1 ) and review <> '0'
    `, [req.params.uid]);
    await client.end()
    res.send(rows)
});

app.get('/blocked', login, async (req, res) => {
    const client = new Client(db)
    await client.connect()
    const { rows: user } = await client.query(`
        update "clients" 
        set "blocked" = CURRENT_DATE
        where "phone" = $1 
        returning nikname , status    
    `, [req.query.phone]);
    const nikname = user[0].nikname
    const status = user[0].status
    fs.unlink(`/data/images/ + ${nikname} + '.jpg'`, (err) => {
        if (err) {
            console.log('Ошибка удаления иконки');
        }
        console.log("Иконка удалена");
    });

    if (status === 'client') {
        await client.query(`
            delete from "adminchat"
            where "sendler_nikname" = $1 or "recipient_nikname" = $1
        `, [nikname]);
        await client.query(`
            delete from "chat"
            where "sendler_nikname" = $1 or "recipient_nikname" = $1
        `, [nikname]);
        await client.end()
        res.send("Профиль удалён")

    } else {
        await client.query(`
            delete from "masters"
            where "nikname" = $1
        `, [nikname]);
        await client.query(`
            delete from "services"
            where "nikname" = $1
        `, [nikname]);
        await client.query(`
            delete from "schedule"
            where "nikname" = $1
        `, [nikname]);
        const { rows: images } = await client.query(`
            select id from "images" where "nikname" = $1
        `, [nikname]);
        const all_images = images.map(i => i.id)
        for (const i of all_images) {
            fs.unlink(`/data/images/ + ${i} + '.jpg'`, async (err) => {
                if (err) {
                    console.log('Ошибка удаления изображения');
                }
                await client.query(`
                    delete from  "images"
                    where "id" = $1
                `, [i]);

                console.log("Изображение  удалено");
            });
        }
        await client.query(`
            delete from "adminchat"
            where "sendler_nikname" = $1 or "recipient_nikname" = $1
            `, [nikname]);
        await client.query(`
            delete from "chat"
            where "sendler_nikname" = $1 or "recipient_nikname" = $1
            `, [nikname]);
        await client.end()
        res.send("Профиль удален")
    }
})

app.get('/changerating', login, async (req, res) => {
    const client = new Client(db)
    await client.connect()
    await client.query(`
        update "clients" 
        set "rating" = $1
        where "nikname" = $2
    `, [req.query.rating, req.query.name]);
    await client.end()
    res.send('Рейтинг мастера изменён.')
})

app.get('/setreadmessage', login, async (req, res) => {
    const client = new Client(db)
    await client.connect()
    await client.query(`
        update "adminchat" 
        set "read" = true
        where "chat" = $1 and "ms_date" = $2
    `, [req.query.chat, req.query.date]);
    await client.end()
    res.send('OK')
})
app.get('/deleteblocked', login, async (req, res) => {
    const client = new Client(db)
    await client.connect()
    await client.query(`
        delete from "clients"         
        where "phone" = $1
    `, [req.query.phone]);
    await client.end()
    res.send('Заблокированый пользователь удален')
})

app.get('/get_nikname', login, async (req, res) => {
    const client = new Client(db)
    await client.connect()
    const { rows } = await client.query(`
        select nikname 
        from "clients" 
        where "phone" = $1 
    `, [req.query.phone]);
    await client.end()
    res.send(rows)
})

app.get('/clients', login, async (req, res) => {
    const client = new Client(db)
    await client.connect()
    const { rows } = await client.query(`
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
        ORDER BY registration limit $1 offset $2
    `, [req.query.limit, req.query.offset]);
    if (rows) {
        res.send(rows)
    } else {

        res.send(JSON.stringify({ 'message': 'error' }))
    }
    await client.end()
})

app.get('/find_client', login, async (req, res) => {
    const client = new Client(db)
    await client.connect()
    const phone = +req.query.phone
    const nikname = req.query.nikname
    const { rows } = await client.query(`
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
    `, [phone + '%', nikname + '%']);
   
    if (rows) {
        res.send(rows)
    } else {
        res.send(JSON.stringify({ 'message': 'error' }))
    }
    await client.end();
})

app.get('/find_all_images/:id', login, async (req, res) => {
    const client = new Client(db)
    await client.connect()

    if (req.params.id  == 0) {

        const { rows } = await client.query("select * from images");

        await client.end();
        res.send(rows)
    } else {
        const { rows } = await client.query(`
            select *          
            from "images" 
            where "service" = $1         
        `, [services[req.params.id]]);
        await client.end();
        res.send(rows)
    }
})

app.get('/createclienticon', async (req, res) => {
    const copy = "/data/images/" + req.query.name + ".jpg"
    fs.copyFile(__dirname + '/main.jpg', copy, (error) => {
        if (error) {
            throw error
        } else {
            res.send('File has been moved to another folder.')
        }
    })
})

app.get('/messages', login, async (req, res) => {
    const client = new Client(db)
    await client.connect()
    const time_today = Date.now() - 900000000 
    const { rows: result } = await client.query(`
    select chat, recipient, ms_date, sendler, read, recipient_nikname, sendler_nikname from (
        select distinct on ( chat ) *         
        from  "adminchat"  
        where (chat > 0 and ms_date > $1)        
        order by chat, ms_date desc
      ) chat
      order by ms_date DESC
    `, [time_today]);
    await client.end();
    if (result) {
        res.send(result)
    } else {
        res.send(JSON.stringify({ 'message': 'error' }))
    }
})

app.get('/admin_user_dialog', login, async (req, res) => {
    const client = new Client(db)
    await client.connect()
    const { rows } = await client.query(`
    select * from  adminchat where recipient_nikname = $1 or sendler_nikname = $1`
    , [req.query.nikname]);
    if (rows.length > 0) {
        await client.end();
        res.send(rows)
    } else {
        await client.end();
        res.send(JSON.stringify({ 'message': 'error' }))
    }
})
app.get('/admin_user_dialog_chat', login, async (req, res) => {
    const client = new Client(db)
    await client.connect()
    const { rows } = await client.query(`
    select * from  adminchat where chat = $1 `
    , [req.query.chat]);
    if (rows.length > 0) {
        await client.end();
        res.send(rows)
    } else {
        await client.end();
        res.send(JSON.stringify({ 'message': 'error' }))
    }
})

app.get('/delete_image/:id', login, async (req, res) => {
    fs.unlink(`/data/images/${req.params.id}` + '.jpg', async (error) => {
        if (error) { console.log(error) }
        const client = new Client(db)
        await client.connect()
        await client.query(`delete from "images" where "id" = $1`, [req.params.id]);
        await client.end();
        res.send("Delete  image successfully")
    })
})

app.get('/deleteuser', async (req, res) => {
    const { nikname, phone } = req.query;
    fs.unlink(`/data/images/${nikname}` + '.jpg', err => {
        if (err) {
            console.log(err)
        }
    })
    const client = new Client(db)
    await client.connect()
    await client.query(`DELETE FROM "history" WHERE "phone" = $1`, [phone]);
    await client.query(`DELETE from "clients" WHERE "nikname" = $1`, [nikname]);
    await client.query(`DELETE from "orders" WHERE "client" = $1 or "master" = $1`, [nikname]);
    if (req.query.status === 'client') {
        await client.query(`DELETE from "adminchat" WHERE "sendler_nikname" = $1 or "recipient_nikname" = $1`, [nikname]);

        await client.query(`DELETE from "chat" WHERE "sendler_nikname" = $1 or "recipient_nikname" = $1`, [nikname]);
        console.log('Профиль клиента - ' , nikname, ', удалён.' );
        res.send("Профиль  удалён")

    } else {
        const { rows: images } = await client.query(`
            SELECT FROM "images"
            WHERE "nikname" = $1
        `, [nikname]);
        for (const i of images.map(a=>a.id)) {
            fs.unlink(`/data/images/${i}` + '.jpg', err => {
                if (err) {
                    console.log(err)
                }
                console.log(' Изображение  удалено ')

            })
        }
        await client.query(`DELETE from "masters" WHERE "nikname" = $1`, [nikname]);

        await client.query(`DELETE from "services" WHERE "nikname" = $1`, [nikname]);

        await client.query(`DELETE from "schedule" WHERE "nikname" = $1`, [nikname]);

        await client.query(`DELETE from "events" WHERE "master_nikname" = $1`, [nikname]);

        await client.query(`DELETE from "images" WHERE "nikname" = $1`, [nikname]);       

        await client.query(`DELETE from "adminchat" WHERE "sendler_nikname" = $1 or "recipient_nikname" = $1`
            , [nikname]);

        await client.query(`DELETE from "chat" WHERE "sendler_nikname" = $1 or "recipient_nikname" = $1`
            , [nikname]);
        console.log('Профиль мастера - ' , nikname, ', удалён.' );
        res.send("Профиль удален")
    }
    await client.end();
})
app.get('/rename_master_icon', (req, res) => {
    fs.rename('/data/images/' + req.query.oldname + '.jpg', '/data/images/' + req.query.newname + '.jpg', function (err) {
        if (err) {
            console.log(err)
            res.send('Ошибка переименования иконки мастера')
        } else {
            console.log("Successfully renamed the icon.")
            res.send('Successfully renamed the icon.')
        }
    })
})
app.get('/sendmessages', login, async (req,res) => {
    const client = new Client(db)
    await client.connect()
    const { rows } = await client.query("select * from adminchat where chat = '0'");
    await client.end();
    res.send( rows )
})
app.post('/answer_message', login, async (req, res) => {
    const client = new Client(db)
    await client.connect()
    let dt = Date.now()
    await client.query(`
        insert into "adminchat" (recipient,recipient_nikname,sendler,sendler_nikname,ms_text,ms_date,chat) 
        values ($1,$2,$3,$3,$4,$5,$6)  
    `, [req.body.recipient, req.body.recipient_nikname, 'администратор', req.body.ms_text, dt, req.body.chat]);
    await client.end();
    res.send("Сообщение изменено")
})
app.post('/message', login, async (req, res) => {
    const client = new Client(db)
    await client.connect()
    let dt = Date.now()
    await client.query(`
        insert into "adminchat" (recipient, recipient_nikname, 
            sendler, sendler_nikname, ms_text, ms_date, chat
        ) values ($1,$2,$3,$3,$4,$5,$6)
    `, [req.body.recipient, req.body.recipient_nikname, 'администратор', req.body.ms_text, dt, req.body.chat])
    await client.end();
    res.status(200).send({ text: "Сообщение добавлено" })
})

let calls = {}

app.post('/call',  (req, res) => {    
    if (req.body.code) {
        if (calls[req.body.tel] === +req.body.code) {
            console.log(req.body.tel, ':' , req.body.code)           
            delete calls[req.body.tel]
            res.status(200).end('Code is good')
        } else {
            res.status(404).end("Code is fall")
        }
    } else {
        // if (ips.filter(i => i === req.body.ip).length < 2) {
            // calls[req.body.tel] = +req.body.code
            calls[req.body.tel] = 1234
            console.log(req.body.tel)
            // res.set('Access-Control-Allow-Origin', '*');
            // client.call.send({ to: req.body.tel })
            //     .then((responce) => {                               
            //         calls[req.body.tel] = +responce.code                                        
            //         awaiting[req.body.ip] = Date.now()
            //         ips.push(req.body.ip)
                    // console.log(ips, responce.code, awaiting)
                    res.status(200).end("Enter code")
                // })
        // } else {
        //     if (Date.now() - awaiting[req.body.ip] > 60000) {
        //         delete awaiting[req.body.ip]
        //         let new_ips = ips.filter(i => i != req.body.ip)
        //         ips = new_ips
        //         res.set('Access-Control-Allow-Origin', '*');
        //         client.call.send({ to: req.body.tel })
        //             .then((responce) => {
                        
        //                 calls[req.body.tel] = +responce.code                                        
        //                 awaiting[req.body.ip] = Date.now()
        //                 ips = []
        //                 ips.push(req.body.ip)
        //                 console.log('after awaiting', ips, responce.code, awaiting)
        //                 res.status(200).end("Enter code")
        //             })
        //         res.status(400).end("Enter code")

        //     } else {
        //         let sec = 60 - ((Date.now() - awaiting[req.body.ip]) / 1000).toFixed(0) + ''
        //         console.log('sec', sec)
        //         res.status(500).end(sec)
        //     }
        // }
    }
})

app.post('/code', limiter, async (req, res) => {
    const dbclient = new Client(db)
    await dbclient.connect()    
    let { rows } = await dbclient.query(`SELECT blocked from "clients" WHERE "phone" = $1 `, [req.body.tel]);
    if( rows.length != 0) {
        if( rows[0].blocked != '0' ) {
            res.send({ message: "Номер заблокирован", statusCode: 429 });
            await dbclient.end();
            return
        }
    }
   
    await dbclient.end();
   
    res.set('Access-Control-Allow-Origin', '*');
    console.log(req.body.ip, ':', req.body.tel);
    // calls[req.body.tel] = 1234
    client.call.send({ to: req.body.tel })
    .then((responce) => {                               
        calls[req.body.tel] = +responce.code 
         
        res.send({message:"Enter code", statusCode: 200})
    })
})
function login(req, res, next) {
    if (secret_key.includes(req.headers.authorization)) {
        next()
    } else {
        return res.status(500).send('not logining');
    }
}
app.use('/', express.static(__dirname + '/build'));


app.post('/enter', limiter, async (req, res) => {   
    const { name, password, ip , city } = req.body;
    if(secret_key.length > 100) {
        secret_key = ''
    }     
    const dt = new Date().toLocaleDateString();
    const crypto = require('crypto').randomBytes(8).toString('hex');
    console.log(`User ${ip} is trying to login  at ${dt} from ${city}.`)
    if (name === 'Admin' && password === 'YMu5sePYCxVq45R') { 
        secret_key = secret_key +  crypto;      
        res.status(200).send({"message": "ok","key": crypto})
    } else {
        res.status(200).send({ "message": "Имя или пароль не верные" })
    }
});

const storageConfig = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, '../../data/images');
    },
    filename: (req, file, cb) => {
        cb(null, 'del' + file.originalname);
    }
});

app.use(multer({ storage: storageConfig }).single("file"));
app.post("/upload", async (req, res) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "X-Requested-With");
    if (!req.file) {       
        res.send("No file upload")
    } else {
        const newpath = '../../data/images/del' + req.file.originalname;
        const newpath_1 = '../../data/images/' + req.body.name + '.jpg';
        const metadata = await sharp(newpath).metadata();
        const ratio = (metadata.width / metadata.height).toFixed(2);
        sharp(newpath)
            .resize(500, +(500 / ratio).toFixed(0))
            .withMetadata()
            .toFormat('jpeg')
            .jpeg({
                quality: 80,
                chromaSubsampling: '4:4:4',
                force: true
            })
            .toFile(newpath_1, function (err) {
                fs.unlink(newpath, async (err) => {
                    if (err) {
                        console.log('Ошибка записи изображения');
                    }
                });
            });
        console.log('Upload', req.body.name)
        res.send('file uploaded')
    }   
});

app.use(express.static(path.join(__dirname, '/public')));

app.get('*', (req, res) => {
    res.sendFile(path.resolve(__dirname, 'build', 'index.html'));
});

app.listen(5000, () => console.log(`Server ${process.env.admin || 'Bob'} listening on port 5000`));