import {randomBytes,timingSafeEqual} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {OAuth2Client,CodeChallengeMethod} from 'google-auth-library';

const random=()=>randomBytes(32).toString('base64url');
const equal=(a,b)=>{if(typeof a!=='string'||typeof b!=='string'||a.length>512||b.length>512)return false;const left=Buffer.from(a),right=Buffer.from(b);return left.length===right.length&&timingSafeEqual(left,right);};
const errors={denied:'Sign-in was cancelled. You can try again when you are ready.',expired:'This sign-in session has expired. Please start again.',invalid:'We could not verify this sign-in. Please try again.',private:'This is a private workspace. That Google account has not been granted access.',provider:'Google sign-in could not be completed. Please try again.'};
const SESSION_MS=8*60*60*1000,LOGIN_MS=10*60*1000;
export function readConfig(env=process.env){
 const clientId=env.GOOGLE_CLIENT_ID?.trim(),clientSecret=env.GOOGLE_CLIENT_SECRET?.trim();
 if(!clientId||!clientSecret)throw new Error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in the server environment.');
 let base;try{base=new URL(env.REFLECT_BASE_URL?.trim()||env.RENDER_EXTERNAL_URL);}catch{throw new Error('Set REFLECT_BASE_URL to the exact HTTPS origin, or deploy on Render with RENDER_EXTERNAL_URL.');}
 if(base.username||base.password||base.pathname!=='/'||base.search||base.hash)throw new Error('REFLECT_BASE_URL must be an origin without a path, query, or credentials.');
 const dev=base.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(base.hostname);
 if(base.protocol!=='https:'&&!dev)throw new Error('Google sign-in requires HTTPS, except for local development.');
 const emails=(env.REFLECT_ALLOWED_EMAILS||'').split(',').map(v=>v.trim().toLowerCase()).filter(Boolean);
 if(!emails.length||emails.some(v=>!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)||v.includes('*')))throw new Error('Set REFLECT_ALLOWED_EMAILS to the exact approved email addresses. An empty or wildcard allowlist is not permitted.');
 const ownerEmail=(env.REFLECT_OWNER_EMAIL||'').trim().toLowerCase();
 if(ownerEmail&&!emails.includes(ownerEmail))throw new Error('REFLECT_OWNER_EMAIL must be in REFLECT_ALLOWED_EMAILS.');
 return {clientId,clientSecret,baseUrl:base.origin,allowedEmails:emails,ownerEmail,secure:!dev};
}
export function createAuthApp(config,{oauth,now=()=>Date.now(),maxEntries=5000}={}){
 const client=oauth||new OAuth2Client(config.clientId,config.clientSecret,`${config.baseUrl}/auth/google/callback`);
 const sessions=new Map(),logins=new Map(),allowed=new Set(config.allowedEmails.map(v=>v.toLowerCase()));
 const sessionName=config.secure?'__Host-reflect-session':'reflect-session';
 const loginName=config.secure?'__Host-reflect-login':'reflect-login';
 const cookie=(name,value,seconds)=>`${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${config.secure?'; Secure':''}`;
 const cookies=request=>Object.fromEntries((request.headers.get('cookie')||'').split(';').map(v=>{const i=v.indexOf('=');return i<0?[]:[v.slice(0,i).trim(),v.slice(i+1).trim()];}).filter(v=>v.length===2));
 const prune=()=>{for(const map of [sessions,logins])for(const [id,v]of map)if(v.expires<=now())map.delete(id);};
 const common={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"};
 const respond=(body,status=200,headers={})=>new Response(body,{status,headers:{...common,...headers}});
 const redirect=(path,headers={})=>respond(null,303,{Location:path,...headers});
 const errorRedirect=(kind,clear=true)=>redirect(`/login?error=${kind}`,clear?{'Set-Cookie':cookie(loginName,'',0)}:{});
 const account=request=>{const id=cookies(request)[sessionName];const s=id?sessions.get(id):null;if(!s||s.expires<=now())return null;return {id,...s};};
 const load=async name=>readFile(new URL(`../dist/${name}`,import.meta.url));
 const loginHtml=kind=>`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Sign in · Reflect AI</title><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/login.css"></head><body class="login-page"><main class="login-card"><div class="login-brand"><span>R</span>Reflect <small>AI</small></div><p class="eyebrow">A personal space to move forward</p><h1>Small steps.<br>Real progress.</h1><p class="login-description">Turn your goals into a practical plan, take the next step, and learn as you go.</p>${errors[kind]?`<div class="login-error" role="alert">${errors[kind]}</div>`:''}<a class="button google-button" href="/auth/google/start">Continue with Google</a><p class="login-note">Sign in with an approved Google account.<br>This prototype is private.</p><p class="login-data">Your goals and reflections are saved in this browser, separately for each signed-in account.</p></main></body></html>`;
 return async request=>{
  prune();const url=new URL(request.url),path=url.pathname;const method=request.method;
  if(!['GET','HEAD','POST'].includes(method))return respond('Method not allowed',405,{Allow:'GET, HEAD, POST'});
  if(path==='/healthz'&&(method==='GET'||method==='HEAD'))return respond(JSON.stringify({status:'ok',authentication:'google',private:true}),200,{'Content-Type':'application/json'});
  if(path==='/login'&&(method==='GET'||method==='HEAD'))return account(request)?redirect('/'):respond(loginHtml(url.searchParams.get('error')),200,{'Content-Type':'text/html; charset=utf-8'});
  if(path==='/auth/google/start'&&method==='GET'){
   if(logins.size>=maxEntries)return respond('Please try sign-in again shortly.',429,{'Retry-After':'60'});
   const previous=cookies(request)[loginName];if(previous)logins.delete(previous);
   const state=random(),nonce=random();const {codeVerifier,codeChallenge}=await client.generateCodeVerifierAsync();
   logins.set(state,{state,nonce,codeVerifier,expires:now()+LOGIN_MS});
   const destination=new URL(client.generateAuthUrl({scope:['openid','email','profile'],access_type:'online',prompt:'select_account',state,code_challenge:codeChallenge,code_challenge_method:CodeChallengeMethod.S256}));destination.searchParams.set('nonce',nonce);
   return redirect(destination.toString(),{'Set-Cookie':cookie(loginName,state,LOGIN_MS/1000)});
  }
  if(path==='/auth/google/callback'&&method==='GET'){
   const state=url.searchParams.get('state'),cookieState=cookies(request)[loginName],tx=logins.get(cookieState);
   if(!tx||tx.expires<=now()||!equal(state,tx.state))return errorRedirect('expired');
   logins.delete(cookieState);
   if(url.searchParams.has('error'))return errorRedirect('denied');
   const code=url.searchParams.get('code');if(!code||code.length>4096)return errorRedirect('invalid');
   let payload;
   try{
    const {tokens}=await client.getToken({code,codeVerifier:tx.codeVerifier,redirect_uri:`${config.baseUrl}/auth/google/callback`});
    if(!tokens.id_token)return errorRedirect('invalid');
    const ticket=await client.verifyIdToken({idToken:tokens.id_token,audience:config.clientId});payload=ticket.getPayload();
   }catch{return errorRedirect('provider');}
   if(!payload||typeof payload.sub!=='string'||!payload.sub||payload.email_verified!==true||typeof payload.email!=='string'||!equal(payload.nonce,tx.nonce))return errorRedirect('invalid');
   const email=payload.email.toLowerCase();if(!allowed.has(email))return errorRedirect('private');
   if(sessions.size>=maxEntries)return respond('Please try sign-in again shortly.',429,{'Retry-After':'60','Set-Cookie':cookie(loginName,'',0)});
   const old=cookies(request)[sessionName];if(old)sessions.delete(old);
   const id=random(),user={id:payload.sub,email,name:typeof payload.name==='string'?payload.name.slice(0,200):email,legacyOwner:!!config.ownerEmail&&email===config.ownerEmail};
   sessions.set(id,{user,expires:now()+SESSION_MS});
   const headers=new Headers(common);headers.set('Location','/');headers.append('Set-Cookie',cookie(sessionName,id,SESSION_MS/1000));headers.append('Set-Cookie',cookie(loginName,'',0));
   return new Response(null,{status:303,headers});
  }
  if(path==='/auth/logout'&&method==='POST'){
   if(request.headers.get('origin')!==config.baseUrl)return respond('Request origin is not allowed.',403);
   const id=cookies(request)[sessionName];if(id)sessions.delete(id);
   return redirect('/login',{'Set-Cookie':cookie(sessionName,'',0)});
  }
  if(path==='/auth/logout')return respond('Use the sign-out button in your workspace.',405,{Allow:'POST'});
  if(method==='POST')return respond('Method not allowed',405,{Allow:'GET, HEAD'});
  if(path==='/style.css'||path==='/favicon.svg')return respond(await load(path.slice(1)),200,{'Content-Type':path.endsWith('.css')?'text/css; charset=utf-8':'image/svg+xml'});
  if(path==='/login.css')return respond(await readFile(new URL('./login.css',import.meta.url)),200,{'Content-Type':'text/css; charset=utf-8'});
  const session=account(request);if(!session)return path==='/api/session'?respond(JSON.stringify({signedIn:false}),401,{'Content-Type':'application/json'}):redirect('/login');
  if(path==='/api/session')return respond(JSON.stringify({signedIn:true,user:session.user}),200,{'Content-Type':'application/json'});
  if(path==='/'||path==='/index.html'){
   const html=(await load('index.html')).toString();const json=JSON.stringify(session.user).replace(/</g,'\\u003c');
   return respond(html.replace('<script type="module" src="/app.js"></script>',`<script type="application/json" id="reflect-account">${json}</script>\n  <script type="module" src="/app.js"></script>`),200,{'Content-Type':'text/html; charset=utf-8'});
  }
  const files={'/app.js':'text/javascript; charset=utf-8','/planner.js':'text/javascript; charset=utf-8'};
  if(files[path])return respond(await load(path.slice(1)),200,{'Content-Type':files[path]});
  return respond('Page not found',404,{'Content-Type':'text/plain; charset=utf-8'});
 };
}
