import test from 'node:test';
import assert from 'node:assert/strict';
import {createSupabase,ProviderError} from '../server/supabase.mjs';
const config={supabaseUrl:'https://project.supabase.co',supabaseKey:'sb_publishable_test',baseUrl:'https://reflect.example'};
test('REST adapter uses publishable key plus user bearer, expected auth routes, and scoped revision filters',async()=>{
 const calls=[];const provider=createSupabase(config,{fetchImpl:async(url,options)=>{calls.push({url,options});return Response.json(url.includes('/rest/')?[{state:null,revision:3}]:{});}});
 await provider.signUp('new@gmail.com','preferred-password');assert.match(calls[0].url,/\/auth\/v1\/signup\?redirect_to=/);assert.equal(calls[0].options.headers.apikey,config.supabaseKey);assert.equal(calls[0].options.headers.Authorization,undefined);
 await provider.verify('hashed-token','email');assert.deepEqual(JSON.parse(calls.at(-1).options.body),{token_hash:'hashed-token',type:'email'});
 await provider.workspace('user-token','user-one');assert.equal(calls.at(-1).options.headers.Authorization,'Bearer user-token');assert.match(calls.at(-1).url,/user_id=eq.user-one/);
 await provider.save('user-token','user-one',{version:1},2);assert.match(calls.at(-1).url,/revision=eq.2/);assert.equal(calls.at(-1).options.method,'PATCH');assert.deepEqual(JSON.parse(calls.at(-1).options.body),{state:{version:1},revision:3});
 await provider.save('user-token','user-one',{version:1},0);assert.equal(calls.at(-1).options.method,'POST');assert.equal(JSON.parse(calls.at(-1).options.body).user_id,'user-one');
});
test('Provider errors and zero-row stale updates are reported safely',async()=>{
 const stale=createSupabase(config,{fetchImpl:async()=>Response.json([])});await assert.rejects(stale.save('token','id',{},1),error=>error instanceof ProviderError&&error.status===409);
 const failure=createSupabase(config,{fetchImpl:async()=>Response.json({message:'private details',code:'failure'},{status:403})});await assert.rejects(failure.user('token'),error=>error.status===403&&!error.message.includes('private details'));
});
