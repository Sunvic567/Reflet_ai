import {createServer} from 'node:http';
import {readConfig,createAuthApp} from './auth.mjs';
const config=readConfig();const handle=createAuthApp(config);
const port=Number(process.env.PORT||3000);
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,config.baseUrl);let body;
  if(!['GET','HEAD'].includes(req.method)){
   const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>5*1024*1024){res.writeHead(413,{'Content-Type':'text/plain'});res.end('Request too large');return;}chunks.push(chunk);}body=Buffer.concat(chunks);
  }else req.resume();
  const request=new Request(url,{method:req.method,headers:req.headers,...(body?{body}: {})});
  const response=await handle(request);res.statusCode=response.status;
  for(const [key,value] of response.headers)if(key!=='set-cookie')res.setHeader(key,value);
  const cookies=response.headers.getSetCookie();if(cookies.length)res.setHeader('Set-Cookie',cookies);
  res.end(req.method==='HEAD'?undefined:Buffer.from(await response.arrayBuffer()));
 }catch{res.writeHead(500,{'Content-Type':'text/plain','Cache-Control':'no-store'});res.end('This request could not be completed. Please try again.');}
});
server.requestTimeout=30000;server.headersTimeout=20000;
server.listen(port,'0.0.0.0',()=>console.log(`Reflect AI authentication server listening on port ${port}.`));
