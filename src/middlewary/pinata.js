const axios = require('axios');
const FormData = require('form-data');
var https = require('https');
const request = require("sync-request");
var fs = require('fs');
const pinataSDK = require('@pinata/sdk');
const pinata = pinataSDK('bad2f22b6983b9bafe7f', '4226d30ecc102f410457ca083cbb33e9a5cdd671435d5d38258d2047a67e8b48');
// const  ipfsLink = require('./utils');

const JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySW5mb3JtYXRpb24iOnsiaWQiOiI3ZTQzNTA4YS0xODcxLTQxMTgtOTMzZS1jYTBlZDlkY2I2M2UiLCJlbWFpbCI6IjE5aGFtMDlAZ21haWwuY29tIiwiZW1haWxfdmVyaWZpZWQiOnRydWUsInBpbl9wb2xpY3kiOnsicmVnaW9ucyI6W3siaWQiOiJGUkExIiwiZGVzaXJlZFJlcGxpY2F0aW9uQ291bnQiOjF9XSwidmVyc2lvbiI6MX0sIm1mYV9lbmFibGVkIjpmYWxzZSwic3RhdHVzIjoiQUNUSVZFIn0sImF1dGhlbnRpY2F0aW9uVHlwZSI6InNjb3BlZEtleSIsInNjb3BlZEtleUtleSI6ImVhODMyMzY1NzRjNWU5MzAyZDM0Iiwic2NvcGVkS2V5U2VjcmV0IjoiMGRmMzkwOWNjMGMzNjdiYTNlYzVkY2QxOTVkZmI5N2M4ODdjZWJiZTJlZTZiYjAwNWNiMzJhYjY3MzkxZTQ0NCIsImlhdCI6MTY1OTUyMzA0Nn0.bUF6kIsPJtxtVVgWJomfk3J930ZuHgnMt3vMIvRZQUk";

const url = 'https://run.genoverse.net:3355/result/1659299207/NFT.png';

exports.PinataFile = async () => { 
  
  

    // const file = fs.createReadStream('assets/a.png');
    // const title = 'My file';
  
    
  
   const response = await axios.get(url,  {
      responseType: 'arraybuffer'
    });
    fs.writeFileSync('assets/a.png', response.data);
   
    let ss = await  pinata.pinFileToIPFS(
              fs.createReadStream(url)
            );
            console.log(ss.IpfsHash);
    

  // const file = fs.createWriteStream('assets/a.png');  
 
 
  // https.get(url, function(response) {
  //   response.pipe(file);
  //     file.on('finish', async function() { 
  //       let ss = await  pinata.pinFileToIPFS(
  //         fs.createReadStream('assets/a.png')
  //       );
  //       console.log(ss);
  //     });  
      
      
  //   });    
  //  let ss = await  pinata.pinFileToIPFS(
  //         fs.createReadStream('assets/a.png')
  //       );

      
    
    // .then((result) => {
    //       // fs.unlink('a.png', function (err) {
    //       //   if (err) throw err;
    //       //   // if no error, file has been deleted successfully
    //       //   console.log('File deleted!');
    //       // });
    //      let sss = result.IpfsHash;
        
    //       return sss
         
    //   }).catch((err) => {
    //       console.log(err);
    //       throw new Error(err)
    //   });
   
      
  //   });
  // });

  // return console.log(s.data)
 

};
