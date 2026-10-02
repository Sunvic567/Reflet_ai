import {readFile} from 'node:fs/promises';
import {createSupabase,ProviderError} from './supabase.mjs';
import {validateImport} from '../dist/planner.js';

const gmail=value=>typeof value==='string'&&/^[a-z0-9][a-z0-9.+_-]*@gmail\.com$/i.test(value)&&value.length<=254;
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const passwordOk=value=>typeof value==='string'&&value.length>=8&&value.length<=128;
const tokenOk=value=>typeof value==='string'&&/^[a-zA-Z0-9_.-]{10,3500}$/.test(value);
const hashOk=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{20,256}$/.test(value);
export function readConfig(env=process.env){
 let base,provider;
 try{base=new URL(env.REFLECT_BASE_URL?.trim()||env.RENDER_EXTERNAL_URL);provider=new URL(env.SUPABASE_URL?.trim());}catch{throw new Error('Set SUPABASE_URL and REFLECT_BASE_URL (or RENDER_EXTERNAL_URL) to valid origins.');}
 for(const url of [base,provider])if(url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('URLs must be origins without paths, queries, or credentials.');
 const local=url=>url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname);
 if([base,provider].some(url=>url.protocol!=='https:'&&!local(url)))throw new Error('HTTPS is required, except for local development.');
 const supabaseKey=env.SUPABASE_PUBLISHABLE_KEY?.trim();
 if(!supabaseKey)throw new Error('Set SUPABASE_PUBLISHABLE_KEY to the project publishable key.');
 let publicKey=supabaseKey.startsWith('sb_publishable_');
 try{publicKey ||= JSON.parse(Buffer.from(supabaseKey.split('.')[1],'base64url').toString()).role==='anon';}catch{}
 if(!publicKey)throw new Error('Use a Supabase publishable or legacy anon key, never a secret or service_role key.');
 const ownerEmail=(env.REFLECT_OWNER_EMAIL||'').trim().toLowerCase();
 if(ownerEmail&&!gmail(ownerEmail))throw new Error('REFLECT_OWNER_EMAIL must be a Gmail address.');
 return {baseUrl:base.origin,supabaseUrl:provider.origin,supabaseKey,ownerEmail,secure:!local(base)};
}

export function createAuthApp(config,{provider=createSupabase(config),now=()=>Date.now()}={}){
 const prefix=config.secure?'__Host-':'',accessName=prefix+'reflect-access',refreshName=prefix+'reflect-refresh';
 const cookie=(name,value,seconds)=>`${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${config.secure?'; Secure':''}`;
 const clear=()=>[cookie(accessName,'',0),cookie(refreshName,'',0)];
 const sessionCookies=session=>{
  if(!tokenOk(session?.access_token)||!tokenOk(session?.refresh_token))throw new Error('Invalid provider session');
  return [cookie(accessName,session.access_token,Math.min(86400,Math.max(60,Number(session.expires_in)||3600))),cookie(refreshName,session.refresh_token,30*86400)];
 };
 const cookies=request=>Object.fromEntries((request.headers.get('cookie')||'').split(';').map(part=>{const i=part.indexOf('=');return i<0?[]:[part.slice(0,i).trim(),part.slice(i+1).trim()];}).filter(part=>part.length===2));
 const common={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"};
 const response=(body,status=200,headers={},setCookies=[])=>{const h=new Headers({...common,...headers});for(const value of setCookies)h.append('Set-Cookie',value);return new Response(body,{status,headers:h});};
 const json=(data,status=200,setCookies=[])=>response(JSON.stringify(data),status,{'Content-Type':'application/json'},setCookies);
 const redirect=(url,setCookies=[])=>response(null,303,{Location:url},setCookies);
 const load=async name=>readFile(new URL(`../dist/${name}`,import.meta.url));
 const validUser=user=>typeof user?.id==='string'&&gmail(user.email)&&!!user.email_confirmed_at;
 async function session(request){
  const values=cookies(request);let token=values[accessName],setCookies=[];
  if(tokenOk(token))try{const user=await provider.user(token);return validUser(user)?{token,user,setCookies}:null;}catch(error){if(!(error instanceof ProviderError&&[400,401,403].includes(error.status)))throw error;}
  const refresh=values[refreshName];if(!tokenOk(refresh))return null;
  let renewed;try{renewed=await provider.refresh(refresh);}catch(error){if(error instanceof ProviderError&&[400,401,403].includes(error.status))return null;throw error;}
  const user=await provider.user(renewed.access_token);if(!validUser(user))return null;
  setCookies=sessionCookies(renewed);return {token:renewed.access_token,user,setCookies};
 }
 const messages={invalid:'Check your Gmail address and password. Confirm your email before signing in.',private:'Use a Gmail address to register or sign in.',password:'Choose a Reflect AI password between 8 and 128 characters.',provider:'We could not complete this request. Please try again shortly.',expired:'This email link has expired or already been used. Request a new one.',confirmation:'Check your Gmail inbox to confirm your account, then sign in.',confirmed:'Your email is confirmed. Sign in with your Reflect AI password.',recovery:'If an account exists, a password reset email has been sent.',reset:'Your password has been updated. Sign in with your new password.',rate:'Too many attempts. Please wait before trying again.'};
 function page(mode='login',message='',hash=''){
  const signup=mode==='signup',forgot=mode==='forgot'||mode==='resend',reset=mode==='reset',confirm=mode==='confirm';
  const title=signup?'Create your account':mode==='resend'?'Resend confirmation':forgot?'Reset your password':reset?'Choose a new password':confirm?'Confirm your Gmail':'Welcome back';
  const action=signup?'signup':mode==='resend'?'resend':forgot?'recover':reset?'reset':confirm?'confirm':'login';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${title} · Reflect AI</title><link rel="icon" href="/favicon.svg"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/login.css"></head><body class="login-page"><main class="login-card"><div class="login-brand"><span>R</span>Reflect <small>AI</small></div><p class="eyebrow">A personal space to move forward</p><h1>${title}</h1><p class="login-description">Plan a meaningful goal, take small steps, and reflect on your progress.</p>${message?`<div class="login-message" role="status">${esc(messages[message]||messages.provider)}</div>`:''}<form method="post" action="/auth/${action}" class="login-form">${hash?`<input type="hidden" name="token_hash" value="${esc(hash)}">`:''}${!reset&&!confirm?'<label for="email">Gmail address</label><input id="email" name="email" type="email" autocomplete="email" placeholder="you@gmail.com" maxlength="254" required>':''}${!forgot&&!confirm?`<label for="password">${signup?'Preferred password':'Password'}</label><input id="password" name="password" type="password" autocomplete="${signup||reset?'new-password':'current-password'}" ${signup||reset?'minlength="8"':''} maxlength="128" required>${signup||reset?'<p class="password-note">Use a password for Reflect AI, separate from your Gmail password. At least 8 characters.</p>':''}`:''}<button class="button" type="submit">${signup?'Create account':mode==='resend'?'Send confirmation email':forgot?'Send reset email':reset?'Save new password':confirm?'Confirm email':'Sign in'}</button></form><p class="login-note">${signup?'<a href="/login">Already registered? Sign in</a>':forgot||reset||confirm?'<a href="/login">Back to sign in</a>':'<a href="/signup">Create an account</a> · <a href="/forgot-password">Forgot password?</a><br><a href="/resend-confirmation">Resend confirmation email</a>'}</p><p class="login-data">Register with Gmail. Your goal and reflections are saved to your own account.</p></main></body></html>`;
 }
 const html=(mode,message,hash,status=200)=>response(page(mode,message,hash),status,{'Content-Type':'text/html; charset=utf-8'});
 // Supabase also applies its project-wide rate limits.
 const attempts=new Map();
 function throttled(email){for(const [key,value]of attempts)if(value.until<=now())attempts.delete(key);let item=attempts.get(email);if(!item){if(attempts.size>=5000)return true;item={count:0,until:now()+10*60000};attempts.set(email,item);}return ++item.count>15;}
 return async request=>{
  const url=new URL(request.url),path=url.pathname,method=request.method;
  if(!['GET','HEAD','POST','PUT'].includes(method))return response('Method not allowed',405);
  if(['POST','PUT'].includes(method)&&request.headers.get('origin')!==config.baseUrl)return response('Request origin is not allowed.',403);
  try{
   if(path==='/healthz'&&['GET','HEAD'].includes(method))return json({status:'ok',authentication:'email-password',database:'supabase',private:true});
   const publicAssets={'/style.css':'text/css; charset=utf-8','/favicon.svg':'image/svg+xml','/login.css':'text/css; charset=utf-8'};
   if(publicAssets[path]&&['GET','HEAD'].includes(method))return response(path==='/login.css'?await readFile(new URL('./login.css',import.meta.url)):await load(path.slice(1)),200,{'Content-Type':publicAssets[path]});
   if(['/login','/signup','/forgot-password','/resend-confirmation'].includes(path)&&['GET','HEAD'].includes(method))return html(path==='/signup'?'signup':path==='/resend-confirmation'?'resend':path==='/forgot-password'?'forgot':'login',url.searchParams.get('message'));
   if(['/auth/confirm','/auth/reset'].includes(path)&&method==='GET'){
    const hash=url.searchParams.get('token_hash');return hashOk(hash)?html(path.endsWith('reset')?'reset':'confirm','',hash):html('login','expired');
   }
   if(['/auth/signup','/auth/login','/auth/recover','/auth/resend','/auth/confirm','/auth/reset'].includes(path)&&method==='POST'){
    if(!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded'))return response('Invalid form',415);
    const raw=await request.text();if(raw.length>4096)return response('Form too large',413);const form=new URLSearchParams(raw);
    const email=(form.get('email')||'').trim().toLowerCase(),password=form.get('password');
    if(path==='/auth/confirm'||path==='/auth/reset'){
     const hash=form.get('token_hash');if(!hashOk(hash))return html('login','expired');
     if(path==='/auth/reset'&&!passwordOk(password))return html('reset','password',hash,400);
     let verified;try{verified=await provider.verify(hash,path.endsWith('reset')?'recovery':'email');}catch(error){if(error instanceof ProviderError&&error.status<500)return html('login','expired');throw error;}
     const user=await provider.user(verified.access_token);if(!validUser(user))return html('login','private',undefined,403);
     if(path==='/auth/reset')await provider.updatePassword(verified.access_token,password);
     await provider.logout(verified.access_token).catch(()=>{});
     return redirect(`/login?message=${path.endsWith('reset')?'reset':'confirmed'}`,clear());
    }
    const mode=path.endsWith('signup')?'signup':path.endsWith('resend')?'resend':path.endsWith('recover')?'forgot':'login';
    if(!gmail(email))return html(mode,'private',undefined,403);
    if(throttled(email))return html(mode,'rate',undefined,429);
    if(mode==='resend'){await provider.resend(email);return redirect('/login?message=confirmation');}
    if(mode==='forgot'){await provider.recover(email);return redirect('/login?message=recovery');}
    if(!password||password.length>128||(mode==='signup'&&!passwordOk(password)))return html(mode,'password',undefined,400);
    if(mode==='signup'){await provider.signUp(email,password);return redirect('/login?message=confirmation',clear());}
    let signedIn;try{signedIn=await provider.signIn(email,password);}catch(error){if(error instanceof ProviderError&&error.status<500)return html('login',error.status===429?'rate':'invalid',undefined,error.status===429?429:400);throw error;}
    const user=await provider.user(signedIn.access_token);if(!validUser(user))return html('login','invalid',undefined,403);
    return redirect('/',sessionCookies(signedIn));
   }
   if(path==='/auth/logout'&&method==='POST'){
    const token=cookies(request)[accessName];if(tokenOk(token))await provider.logout(token).catch(()=>{});
    return redirect('/login',clear());
   }
   if(path.startsWith('/auth/'))return response('Page not found',404);
   const signedIn=await session(request);
   if(!signedIn)return path.startsWith('/api/')?json({error:'Sign in again to save your changes.'},401,clear()):redirect('/login',clear());
   const {user,token,setCookies}=signedIn;
   if(path==='/api/session'&&method==='GET')return json({signedIn:true,user:{id:user.id,email:user.email}},200,setCookies);
   if(path==='/api/workspace'){
    if(method==='GET')return json(await provider.workspace(token,user.id),200,setCookies);
    if(method!=='PUT')return response('Method not allowed',405,{Allow:'GET, PUT'},setCookies);
    if(!request.headers.get('content-type')?.startsWith('application/json'))return json({error:'Use JSON.'},415,setCookies);
    let body;try{const raw=await request.text();if(Buffer.byteLength(raw)>5*1024*1024)return json({error:'Workspace too large.'},413,setCookies);body=JSON.parse(raw);}catch{return json({error:'Invalid workspace.'},400,setCookies);}
    if(!validateImport(body.state)||!Number.isSafeInteger(body.revision)||body.revision<0||body.revision>=2147483647)return json({error:'Invalid workspace.'},400,setCookies);
    try{return json(await provider.save(token,user.id,body.state,body.revision),200,setCookies);}catch(error){if(error instanceof ProviderError&&error.status===409)return json({error:'Another device changed this workspace. Export a backup, then reload.'},409,setCookies);throw error;}
   }
   if(!['GET','HEAD'].includes(method))return response('Method not allowed',405);
   if(path==='/'||path==='/index.html'){
    const workspace=await provider.workspace(token,user.id);
    if((workspace.state!==null&&!validateImport(workspace.state))||!Number.isSafeInteger(workspace.revision))throw new Error('Invalid stored workspace');
    const account={id:user.id,email:user.email,name:user.email.split('@')[0],legacyOwner:user.email.toLowerCase()===config.ownerEmail};
    const embed=(id,value)=>`<script type="application/json" id="${id}">${JSON.stringify(value).replace(/</g,'\\u003c')}</script>`;
    const content=(await load('index.html')).toString().replace('<script type="module" src="/app.js"></script>',`${embed('reflect-account',account)}\n${embed('reflect-workspace',workspace)}\n<script type="module" src="/app.js"></script>`);
    return response(content,200,{'Content-Type':'text/html; charset=utf-8'},setCookies);
   }
   if(['/app.js','/planner.js','/sync.js'].includes(path))return response(await load(path.slice(1)),200,{'Content-Type':'text/javascript; charset=utf-8'},setCookies);
   return response('Page not found',404);
  }catch{return path.startsWith('/api/')?json({error:'Cloud storage is unavailable. Your local backup is preserved. Try again shortly.'},503):html('login','provider',undefined,503);}
 };
}
