import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,createHash} from 'node:crypto';
import {OAuth2Client} from 'google-auth-library';
import {createAuthApp,readConfig} from '../server/auth.mjs';

const config=readConfig({GOOGLE_CLIENT_ID:'test.apps.googleusercontent.com',GOOGLE_CLIENT_SECRET:'test-only-secret',REFLECT_BASE_URL:'https://reflect.example',REFLECT_ALLOWED_EMAILS:'owner@gmail.com',REFLECT_OWNER_EMAIL:'owner@gmail.com'});
const keys=generateKeyPairSync('rsa',{modulusLength:2048});
const publicKey=keys.publicKey.export({type:'spki',format:'pem'});
const encode=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
function token(payload){const parts=`${encode({alg:'RS256',typ:'JWT',kid:'test-key'})}.${encode(payload)}`;return `${parts}.${sign('RSA-SHA256',Buffer.from(parts),keys.privateKey).toString('base64url')}`;}
function harness(){
 let clock=Date.now(),claims={},nonce,challenge,exchanges=0;
 const client=new OAuth2Client(config.clientId,config.clientSecret,`${config.baseUrl}/auth/google/callback`);
 const original=client.generateAuthUrl.bind(client);
 client.generateAuthUrl=options=>{challenge=options.code_challenge;return original(options);};
 client.getFederatedSignonCertsAsync=async()=>({certs:{'test-key':publicKey},format:'PEM'});
 client.getToken=async options=>{
  exchanges++;assert.equal(options.redirect_uri,`${config.baseUrl}/auth/google/callback`);
  assert.equal(createHash('sha256').update(options.codeVerifier).digest('base64url'),challenge,'The token exchange uses the original PKCE verifier');
  const now=Math.floor(Date.now()/1000);
  return {tokens:{id_token:claims.badSignature?'invalid.signature.value':token({iss:'https://accounts.google.com',aud:config.clientId,iat:now,exp:now+3600,sub:'google-owner-subject',email:'owner@gmail.com',email_verified:true,name:'Planner Owner',nonce,...claims})}};
 };
 const handle=createAuthApp(config,{oauth:client,now:()=>clock});
 const request=(path,options={})=>handle(new Request(`${config.baseUrl}${path}`,options));
 return {request,setClaims:value=>{claims=value;},advance:ms=>{clock+=ms;},exchanges:()=>exchanges,async start(){const response=await request('/auth/google/start');const url=new URL(response.headers.get('location'));nonce=url.searchParams.get('nonce');return {response,url,state:url.searchParams.get('state'),cookie:response.headers.get('set-cookie').split(';')[0]};},async finish(start,extra=''){return request(`/auth/google/callback?state=${start.state}&code=test-code${extra}`,{headers:{cookie:start.cookie}});}};
}
test('Config refuses missing credentials, public allowlists, and insecure production origins',()=>{
 assert.throws(()=>readConfig({}),/GOOGLE_CLIENT_ID/);
 for(const change of [{REFLECT_ALLOWED_EMAILS:''},{REFLECT_ALLOWED_EMAILS:'*@gmail.com'},{REFLECT_BASE_URL:'http://reflect.example'},{REFLECT_BASE_URL:'https://reflect.example/path'}])assert.throws(()=>readConfig({GOOGLE_CLIENT_ID:'id',GOOGLE_CLIENT_SECRET:'secret',REFLECT_BASE_URL:config.baseUrl,REFLECT_ALLOWED_EMAILS:'owner@gmail.com',...change}));
 assert.equal(readConfig({GOOGLE_CLIENT_ID:'id',GOOGLE_CLIENT_SECRET:'secret',REFLECT_BASE_URL:'http://localhost:3000',REFLECT_ALLOWED_EMAILS:'owner@gmail.com'}).secure,false);
});
test('Render supplies the default callback origin and an explicit custom domain takes precedence',()=>{
 const env={GOOGLE_CLIENT_ID:'id',GOOGLE_CLIENT_SECRET:'secret',RENDER_EXTERNAL_URL:'https://reflect-test.onrender.com',REFLECT_ALLOWED_EMAILS:'owner@gmail.com'};
 assert.equal(readConfig(env).baseUrl,'https://reflect-test.onrender.com');
 assert.equal(readConfig({...env,REFLECT_BASE_URL:'https://goals.example.com'}).baseUrl,'https://goals.example.com');
 assert.throws(()=>readConfig({...env,RENDER_EXTERNAL_URL:'http://unsafe.example'}),/HTTPS/);
});
test('Private planner and script assets are unavailable without a session',async()=>{
 const h=harness();for(const path of ['/','/index.html','/app.js','/planner.js']){const r=await h.request(path);assert.equal(r.status,303);assert.equal(r.headers.get('location'),'/login');}
 const r=await h.request('/api/session');assert.equal(r.status,401);assert.deepEqual(await r.json(),{signedIn:false});
 const login=await h.request('/login');assert.match(await login.text(),/Continue with Google/);assert.match(login.headers.get('content-security-policy'),/frame-ancestors 'none'/);
});
test('Google authorization uses identity-only scopes, PKCE, state, nonce, and secure cookies',async()=>{
 const h=harness(),s=await h.start();assert.equal(s.response.status,303);assert.equal(s.url.origin,'https://accounts.google.com');assert.deepEqual(new Set(s.url.searchParams.get('scope').split(' ')),new Set(['openid','email','profile']));
 assert.equal(s.url.searchParams.get('code_challenge_method'),'S256');assert.ok(s.url.searchParams.get('nonce'));assert.ok(s.url.searchParams.get('state'));assert.equal(s.url.searchParams.get('redirect_uri'),`${config.baseUrl}/auth/google/callback`);
 const cookie=s.response.headers.get('set-cookie');assert.match(cookie,/__Host-reflect-login=/);assert.match(cookie,/HttpOnly/);assert.match(cookie,/Secure/);assert.match(cookie,/SameSite=Lax/);assert.doesNotMatch(cookie,/Domain=/);
});
test('Approved Google token creates a protected, account-specific workspace session',async()=>{
 const h=harness(),s=await h.start(),r=await h.finish(s);assert.equal(r.status,303);assert.equal(r.headers.get('location'),'/');
 const sessionCookie=r.headers.getSetCookie().find(v=>v.startsWith('__Host-reflect-session=')).split(';')[0];assert.ok(sessionCookie);assert.equal(h.exchanges(),1);
 const identity=await h.request('/api/session',{headers:{cookie:sessionCookie}});const body=await identity.json();assert.equal(body.user.id,'google-owner-subject');assert.equal(body.user.email,'owner@gmail.com');assert.equal(body.user.legacyOwner,true);
 const page=await h.request('/',{headers:{cookie:sessionCookie}});assert.equal(page.status,200);assert.match(await page.text(),/id="reflect-account"/);assert.equal(page.headers.get('cache-control'),'no-store');
 const assets=await h.request('/app.js',{headers:{cookie:sessionCookie}});assert.equal(assets.status,200);assert.match(await assets.text(),/googleAccount/);
 const replay=await h.finish(s);assert.match(replay.headers.get('location'),/error=expired/);assert.equal(h.exchanges(),1);
});
test('State, browser cookie, expiry, cancellation and nonce errors never create a session',async()=>{
 for(const mode of ['state','cookie','expiry','denied','nonce','unicode']){
  const h=harness(),s=await h.start();let r;
  if(mode==='state')r=await h.request(`/auth/google/callback?state=wrong&code=x`,{headers:{cookie:s.cookie}});
  if(mode==='cookie')r=await h.request(`/auth/google/callback?state=${s.state}&code=x`);
  if(mode==='expiry'){h.advance(11*60*1000);r=await h.finish(s);}
  if(mode==='denied')r=await h.finish(s,'&error=access_denied');
  if(mode==='nonce'){h.setClaims({nonce:'wrong-nonce'});r=await h.finish(s);}
  if(mode==='unicode')r=await h.request(`/auth/google/callback?state=${'é'.repeat(43)}&code=x`,{headers:{cookie:s.cookie}});
  assert.match(r.headers.get('location'),/\/login\?error=/,mode);assert.ok(!r.headers.getSetCookie().some(v=>v.startsWith('__Host-reflect-session=')),mode);
 }
});
test('Real Google library signature, audience, issuer, and expiry verification rejects invalid tokens',async()=>{
 const now=Math.floor(Date.now()/1000);
 for(const change of [{badSignature:true},{aud:'different-client'},{iss:'https://untrusted.example'},{exp:now-1000},{email_verified:false},{email:'outsider@gmail.com'}]){
  const h=harness(),s=await h.start();h.setClaims(change);const r=await h.finish(s);assert.match(r.headers.get('location'),/\/login\?error=/);assert.ok(!r.headers.getSetCookie().some(v=>v.startsWith('__Host-reflect-session=')));
 }
});
test('Logout requires a same-origin POST and revokes the session',async()=>{
 const h=harness(),s=await h.start(),r=await h.finish(s),cookie=r.headers.getSetCookie().find(v=>v.startsWith('__Host-reflect-session=')).split(';')[0];
 const get=await h.request('/auth/logout',{headers:{cookie}});assert.equal(get.status,405);
 const foreign=await h.request('/auth/logout',{method:'POST',headers:{cookie,origin:'https://untrusted.example'}});assert.equal(foreign.status,403);
 const ok=await h.request('/auth/logout',{method:'POST',headers:{cookie,origin:config.baseUrl}});assert.equal(ok.status,303);assert.match(ok.headers.get('set-cookie'),/Max-Age=0/);
 assert.equal((await h.request('/api/session',{headers:{cookie}})).status,401);
});
test('Session expires and HTML bootstrap escapes user-controlled profile text',async()=>{
 const h=harness(),s=await h.start();h.setClaims({name:'</script><script>alert(1)</script>'});const r=await h.finish(s),cookie=r.headers.getSetCookie().find(v=>v.startsWith('__Host-reflect-session=')).split(';')[0];
 const html=await(await h.request('/',{headers:{cookie}})).text();assert.doesNotMatch(html,/<script>alert\(1\)<\/script>/);assert.match(html,/\\u003c\/script>/);
 h.advance(9*60*60*1000);assert.equal((await h.request('/api/session',{headers:{cookie}})).status,401);
});
