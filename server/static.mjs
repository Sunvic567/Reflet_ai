// Local preview only. Production starts server/start.mjs and enforces account login.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
const files={'/':'index.html','/index.html':'index.html','/style.css':'style.css','/app.js':'app.js','/planner.js':'planner.js','/sync.js':'sync.js','/favicon.svg':'favicon.svg'};
const types={html:'text/html; charset=utf-8',css:'text/css; charset=utf-8',js:'text/javascript; charset=utf-8',svg:'image/svg+xml'};
const port=Number(process.env.REFLECT_DEV_PORT||3000);
createServer(async(req,res)=>{
 try{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{Allow:'GET, HEAD'});res.end();return;}
  const name=files[new URL(req.url,'http://localhost').pathname];if(!name){res.writeHead(404);res.end('Not found');return;}
  const bytes=await readFile(new URL(`../dist/${name}`,import.meta.url));res.writeHead(200,{'Content-Type':types[name.split('.').at(-1)],'Cache-Control':'no-store'});res.end(req.method==='HEAD'?undefined:bytes);
 }catch{res.writeHead(500);res.end('Preview could not be loaded.');}
}).listen(port,'127.0.0.1',()=>console.log(`Local Reflect AI preview: http://127.0.0.1:${port}. Authentication is disabled only for this local preview.`));
