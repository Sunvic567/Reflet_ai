import {JSDOM} from 'jsdom';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createDemo,today} from '../dist/planner.js';
const html=fs.readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
const old=createDemo(today());old.mode='personal';old.goal.title='My original personal goal';
const records={'reflect-ai-v1':JSON.stringify(old)};
function setup(account){
 const dom=new JSDOM(html,{url:'https://reflect.example/'});const w=dom.window;
 globalThis.window=w;globalThis.document=w.document;globalThis.localStorage=w.localStorage;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};w.HTMLElement.prototype.scrollIntoView=function(){};w.scrollTo=()=>{};
 globalThis.setInterval=()=>1;
 for(const [key,value]of Object.entries(records))localStorage.setItem(key,value);
 const bootstrap=document.createElement('script');bootstrap.type='application/json';bootstrap.id='reflect-account';bootstrap.textContent=JSON.stringify(account);document.body.append(bootstrap);
 return dom;
}
setup({id:'owner-subject',email:'owner@gmail.com',name:'Owner',legacyOwner:true});await import('../dist/app.js?account=owner');
assert.match(document.querySelector('.goal-hero h2').textContent,/My original personal goal/);assert.ok(localStorage.getItem('reflect-ai-v1:owner-subject'));assert.ok(localStorage.getItem('reflect-ai-v1'),'Original backup is preserved');
document.querySelector('[data-action="toggle"]').click();assert.equal(JSON.parse(localStorage.getItem('reflect-ai-v1:owner-subject')).tasks[0].done,true);assert.equal(JSON.parse(localStorage.getItem('reflect-ai-v1')).tasks[0].done,false);
document.querySelector('[data-action="settings"]').click();assert.match(document.querySelector('#modal').textContent,/Signed in with Google as owner@gmail.com/);assert.equal(document.querySelector('form[action="/auth/logout"]').method,'post');
records['reflect-ai-v1:owner-subject']=localStorage.getItem('reflect-ai-v1:owner-subject');
setup({id:'other-subject',email:'other@gmail.com',name:'Other',legacyOwner:false});await import('../dist/app.js?account=other');
assert.doesNotMatch(document.querySelector('.goal-hero h2').textContent,/My original personal goal/);assert.equal(localStorage.getItem('reflect-ai-v1:other-subject'),null);document.querySelector('[data-action="toggle"]').click();assert.equal(JSON.parse(localStorage.getItem('reflect-ai-v1:other-subject')).mode,'demo');assert.equal(JSON.parse(localStorage.getItem('reflect-ai-v1:owner-subject')).goal.title,'My original personal goal');
console.log('PASS: Google account storage isolation, owner-only legacy migration, existing backup preservation, signed-in identity display, and POST sign-out form.');
process.exit(0);
