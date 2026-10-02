import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createDemo} from '../dist/planner.js';

test('Production HTTP adapter forwards form/JSON bodies and serves the protected cloud workspace',{timeout:15000},async()=>{
 const calls=[],user={id:'test-user',email:'fresh@gmail.com',email_confirmed_at:'2026-10-02T10:00:00Z'};
 const provider=createServer(async(req,res)=>{
  let raw='';for await(const chunk of req)raw+=chunk;calls.push({url:req.url,method:req.method,headers:req.headers,body:raw?JSON.parse(raw):null});
  res.setHeader('Content-Type','application/json');
  if(req.url.startsWith('/auth/v1/token'))res.end(JSON.stringify({access_token:'http-access-token',refresh_token:'http-refresh-token',expires_in:3600}));
  else if(req.url==='/auth/v1/user')res.end(JSON.stringify(user));
  else if(req.url.startsWith('/rest/v1/reflect_workspaces'))res.end(JSON.stringify(req.method==='GET'?[]:[{revision:1}]));
  else res.end('{}');
 });
 provider.listen(0,'127.0.0.1');await once(provider,'listening');
 const reservation=createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
 const base=`http://localhost:${port}`;
 const child=spawn(process.execPath,['server/start.mjs'],{cwd:new URL('../',import.meta.url),env:{...process.env,PORT:String(port),REFLECT_BASE_URL:base,SUPABASE_URL:`http://127.0.0.1:${provider.address().port}`,SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',REFLECT_OWNER_EMAIL:''},stdio:['ignore','pipe','pipe']});
 try{
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Server startup timed out')),5000);child.stdout.once('data',()=>{clearTimeout(timer);resolve();});child.once('exit',code=>{clearTimeout(timer);reject(new Error(`Server exited ${code}`));});});
  const health=await fetch(base+'/healthz');assert.equal((await health.json()).authentication,'email-password');
  const signup=await fetch(base+'/auth/signup',{method:'POST',redirect:'manual',headers:{origin:base,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email:'fresh@gmail.com',password:'test-preferred-password'})});assert.equal(signup.status,303);assert.deepEqual(calls.at(-1).body,{email:'fresh@gmail.com',password:'test-preferred-password'});
  const login=await fetch(base+'/auth/login',{method:'POST',redirect:'manual',headers:{origin:base,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({email:user.email,password:'test-preferred-password'})});assert.equal(login.status,303);
  const cookie=login.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
  const root=await fetch(base+'/',{headers:{cookie}});assert.equal(root.status,200);assert.match(await root.text(),/reflect-workspace/);
  const save=await fetch(base+'/api/workspace',{method:'PUT',headers:{cookie,origin:base,'content-type':'application/json'},body:JSON.stringify({state:createDemo(),revision:0,user_id:'other-user'})});assert.equal(save.status,200);assert.equal(calls.at(-1).body.user_id,user.id);assert.equal(calls.at(-1).headers.authorization,'Bearer http-access-token');
 }finally{child.kill();provider.closeAllConnections();await new Promise(resolve=>provider.close(resolve));}
});
