// Server-only adapter: the publishable key and user's token, never an admin key.
export class ProviderError extends Error {
 constructor(status,code){super('Supabase request failed');this.status=status;this.code=code;}
}
export function createSupabase(config,{fetchImpl=fetch}={}){
 async function request(path,{method='GET',token,body,headers={}}={}){
  const response=await fetchImpl(`${config.supabaseUrl}${path}`,{method,
   headers:{apikey:config.supabaseKey,...(token?{Authorization:`Bearer ${token}`} : {}),...(body?{'Content-Type':'application/json'}:{}),...headers},
   ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(15000)});
  const data=await response.json().catch(()=>null);
  if(!response.ok)throw new ProviderError(response.status,data?.error_code||data?.code);
  return data;
 }
 const auth=(path,options)=>request(`/auth/v1${path}`,options);
 return {
  signUp:(email,password)=>auth(`/signup?redirect_to=${encodeURIComponent(config.baseUrl+'/auth/confirm')}`,{method:'POST',body:{email,password}}),
  signIn:(email,password)=>auth('/token?grant_type=password',{method:'POST',body:{email,password}}),
  user:token=>auth('/user',{token}),
  refresh:refresh_token=>auth('/token?grant_type=refresh_token',{method:'POST',body:{refresh_token}}),
  verify:(token_hash,type)=>auth('/verify',{method:'POST',body:{token_hash,type}}),
  resend:email=>auth(`/resend?redirect_to=${encodeURIComponent(config.baseUrl+'/auth/confirm')}`,{method:'POST',body:{email,type:'signup'}}),
  recover:email=>auth(`/recover?redirect_to=${encodeURIComponent(config.baseUrl+'/auth/reset')}`,{method:'POST',body:{email}}),
  updatePassword:(token,password)=>auth('/user',{method:'PUT',token,body:{password}}),
  logout:token=>auth('/logout?scope=local',{method:'POST',token}),
  async workspace(token,userId){
   const rows=await request(`/rest/v1/reflect_workspaces?user_id=eq.${encodeURIComponent(userId)}&select=state,revision&limit=1`,{token});
   return rows?.[0]||{state:null,revision:0};
  },
  async save(token,userId,state,revision){
   const rows=await request(revision===0?'/rest/v1/reflect_workspaces':`/rest/v1/reflect_workspaces?user_id=eq.${encodeURIComponent(userId)}&revision=eq.${revision}`,{
    method:revision===0?'POST':'PATCH',token,headers:{Prefer:'return=representation'},body:revision===0?{user_id:userId,state,revision:1}:{state,revision:revision+1}});
   if(!rows?.length)throw new ProviderError(409,'workspace_conflict');
   return {revision:rows[0].revision};
  }
 };
}
