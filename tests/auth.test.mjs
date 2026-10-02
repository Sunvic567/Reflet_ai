import test from 'node:test';
import assert from 'node:assert/strict';
import {readConfig,createAuthApp} from '../server/auth.mjs';
import {ProviderError} from '../server/supabase.mjs';
import {createDemo} from '../dist/planner.js';
const env={SUPABASE_URL:'https://project.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',REFLECT_BASE_URL:'https://reflect.example'};
const user={id:'user-one',email:'someone@gmail.com',email_confirmed_at:'2026-10-02T12:00:00Z'};
const tokens={access_token:'valid-access-token',refresh_token:'valid-refresh-token',expires_in:3600};
function setup(overrides={}){
 const calls=[];const provider={
  signUp:async(...args)=>{calls.push(['signup',...args]);return {};},
  signIn:async(...args)=>{calls.push(['signin',...args]);return tokens;},
  user:async token=>{calls.push(['user',token]);return user;},
  refresh:async token=>{calls.push(['refresh',token]);return tokens;},
  verify:async(...args)=>{calls.push(['verify',...args]);return tokens;},
  resend:async email=>{calls.push(['resend',email]);},
  recover:async email=>{calls.push(['recover',email]);},
  updatePassword:async(...args)=>{calls.push(['password',...args]);},
  logout:async token=>{calls.push(['logout',token]);},
  workspace:async(...args)=>{calls.push(['workspace',...args]);return {state:null,revision:0};},
  save:async(...args)=>{calls.push(['save',...args]);return {revision:args[3]+1};},...overrides
 };
 return {handle:createAuthApp(readConfig(env),{provider}),calls,provider};
}
function request(path,{method='GET',body,cookie,origin='https://reflect.example',json=false}={}){
 return new Request('https://reflect.example'+path,{method,headers:{...(cookie?{cookie}:{}),...(method==='GET'?{}:{origin,'content-type':json?'application/json':'application/x-www-form-urlencoded'})},...(body!==undefined?{body:json?JSON.stringify(body):new URLSearchParams(body).toString()}:{})});
}
const signed='__Host-reflect-access=valid-access-token; __Host-reflect-refresh=valid-refresh-token';
test('Configuration accepts open Gmail registration and fails closed on unsafe keys/origins',()=>{
 assert.equal(readConfig(env).secure,true);assert.equal(readConfig({...env,RENDER_EXTERNAL_URL:env.REFLECT_BASE_URL,REFLECT_BASE_URL:''}).baseUrl,env.REFLECT_BASE_URL);
 for(const bad of [{SUPABASE_PUBLISHABLE_KEY:'sb_secret_x'},{SUPABASE_URL:'http://example.com'},{REFLECT_BASE_URL:'https://example.com/path'},{REFLECT_OWNER_EMAIL:'owner@example.com'}])assert.throws(()=>readConfig({...env,...bad}));
 const legacy=['e30',Buffer.from(JSON.stringify({role:'anon'})).toString('base64url'),'sig'].join('.');assert.equal(readConfig({...env,SUPABASE_PUBLISHABLE_KEY:legacy}).supabaseKey,legacy);
});
test('Signup form has only Gmail and preferred password; old OAuth routes are gone',async()=>{
 const {handle}=setup();const page=await handle(request('/signup'));const html=await page.text();assert.equal((html.match(/<input /g)||[]).length,2);assert.match(html,/name="email"/);assert.match(html,/name="password"/);assert.doesNotMatch(html,/Continue with Google|oauth/i);
 assert.equal((await handle(request('/auth/google/start'))).status,404);assert.equal((await handle(request('/auth/google/callback'))).status,404);
});
test('Any Gmail can register, verification is requested, and other email domains are rejected',async()=>{
 const {handle,calls}=setup();const response=await handle(request('/auth/signup',{method:'POST',body:{email:'NewPerson@gmail.com',password:'personal-password'}}));assert.equal(response.status,303);assert.equal(response.headers.get('location'),'/login?message=confirmation');assert.deepEqual(calls[0],['signup','newperson@gmail.com','personal-password']);assert.ok(response.headers.getSetCookie().every(v=>v.includes('Max-Age=0')));
 assert.equal((await handle(request('/auth/signup',{method:'POST',body:{email:'someone@example.com',password:'personal-password'}}))).status,403);
 assert.equal((await handle(request('/auth/signup',{method:'POST',body:{email:'someone@gmail.com',password:'short'}}))).status,400);
});
test('Login validates identity with Supabase and stores credentials only in secure HttpOnly cookies',async()=>{
 const {handle}=setup();const response=await handle(request('/auth/login',{method:'POST',body:{email:user.email,password:'preferred-password'}}));assert.equal(response.status,303);assert.equal(response.headers.get('location'),'/');assert.equal(response.headers.getSetCookie().length,2);for(const cookie of response.headers.getSetCookie()){assert.match(cookie,/^__Host-reflect-/);assert.match(cookie,/HttpOnly; SameSite=Lax/);assert.match(cookie,/Secure/);}
 const root=await handle(request('/',{cookie:signed}));const html=await root.text();assert.match(html,/id="reflect-account"/);assert.match(html,/id="reflect-workspace"/);assert.doesNotMatch(html,/valid-access-token|valid-refresh-token|preferred-password/);
 const restart=setup();assert.equal((await restart.handle(request('/',{cookie:signed}))).status,200,'Session survives a server restart');
});
test('Unverified users, invalid passwords, and forged cookies cannot open the planner',async()=>{
 assert.equal((await setup({user:async()=>({...user,email_confirmed_at:null})}).handle(request('/',{cookie:signed}))).status,303);
 assert.equal((await setup({signIn:async()=>{throw new ProviderError(400);}}).handle(request('/auth/login',{method:'POST',body:{email:user.email,password:'wrong'}}))).status,400);
 const {handle}=setup({user:async()=>{throw new ProviderError(401);},refresh:async()=>{throw new ProviderError(400);}});assert.equal((await handle(request('/api/workspace',{cookie:signed}))).status,401);
});
test('Expired access tokens refresh persistently and transient provider outages preserve cookies',async()=>{
 const {handle,calls}=setup({user:async token=>{if(token==='expired-access-token')throw new ProviderError(401);return user;}});
 const response=await handle(request('/api/session',{cookie:'__Host-reflect-access=expired-access-token; __Host-reflect-refresh=valid-refresh-token'}));assert.equal(response.status,200);assert.equal(response.headers.getSetCookie().length,2);assert.ok(calls.some(v=>v[0]==='refresh'));
 const outage=await setup({user:async()=>{throw new Error('network unavailable');}}).handle(request('/api/workspace',{cookie:signed}));assert.equal(outage.status,503);assert.equal(outage.headers.getSetCookie().length,0);
});
test('Confirmation links require a POST and reset links select a new password without auto-login',async()=>{
 const hash='a'.repeat(64),{handle,calls}=setup();assert.equal((await handle(request('/auth/confirm?token_hash='+hash))).status,200);assert.equal(calls.length,0,'Email scanners do not consume tokens');
 const confirmed=await handle(request('/auth/confirm',{method:'POST',body:{token_hash:hash}}));assert.equal(confirmed.headers.get('location'),'/login?message=confirmed');assert.deepEqual(calls[0],['verify',hash,'email']);
 const reset=await handle(request('/auth/reset',{method:'POST',body:{token_hash:hash,password:'my-new-password'}}));assert.equal(reset.headers.get('location'),'/login?message=reset');assert.ok(calls.some(v=>v[0]==='verify'&&v[2]==='recovery'));assert.ok(calls.some(v=>v[0]==='password'&&v[2]==='my-new-password'));
 const resent=await handle(request('/auth/resend',{method:'POST',body:{email:user.email}}));assert.equal(resent.headers.get('location'),'/login?message=confirmation');assert.ok(calls.some(v=>v[0]==='resend'));
 const recover=await handle(request('/auth/recover',{method:'POST',body:{email:user.email}}));assert.equal(recover.headers.get('location'),'/login?message=recovery');
});
test('Mutating requests require exact origin and logout clears both cookies',async()=>{
 const {handle,calls}=setup();for(const path of ['/auth/signup','/auth/login','/auth/logout','/auth/reset'])assert.equal((await handle(request(path,{method:'POST',body:{},origin:'https://evil.example'}))).status,403);
 const response=await handle(request('/auth/logout',{method:'POST',cookie:signed}));assert.equal(response.status,303);assert.equal(response.headers.getSetCookie().length,2);assert.ok(calls.some(v=>v[0]==='logout'));
});
test('Workspace API derives owner from the validated session, rejects invalid state, and returns write conflicts',async()=>{
 const {handle,calls}=setup();const state=createDemo();const response=await handle(request('/api/workspace',{method:'PUT',cookie:signed,json:true,body:{state,revision:0,user_id:'victim-id'}}));assert.equal(response.status,200);assert.equal(calls.find(v=>v[0]==='save')[2],user.id);
 assert.equal((await handle(request('/api/workspace',{method:'PUT',cookie:signed,json:true,body:{state:{bad:true},revision:0}}))).status,400);
 assert.equal((await handle(request('/api/workspace',{method:'PUT',cookie:signed,json:true,body:{state,revision:-1}}))).status,400);
 const conflict=await setup({save:async()=>{throw new ProviderError(409);}}).handle(request('/api/workspace',{method:'PUT',cookie:signed,json:true,body:{state,revision:1}}));assert.equal(conflict.status,409);
});
