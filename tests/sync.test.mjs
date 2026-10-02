import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkspaceSync} from '../dist/sync.js';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('Writes are serialized and intermediate changes collapse into the latest snapshot',async()=>{
 const calls=[],resolves=[];const sync=createWorkspaceSync({revision:4,save:(state,revision)=>new Promise(resolve=>{calls.push({state,revision});resolves.push(resolve);})});
 const first={value:1};sync.enqueue(first);first.value=99;sync.enqueue({value:2});sync.enqueue({value:3});assert.equal(calls.length,1);assert.equal(calls[0].state.value,1);
 resolves.shift()({revision:5});await tick();assert.deepEqual(calls[1],{state:{value:3},revision:5});resolves.shift()({revision:6});await tick();assert.equal(sync.status,'saved');assert.equal(sync.revision,6);
});
test('Offline changes remain pending and can retry without claiming a cloud save',async()=>{
 let failed=true;const statuses=[];const sync=createWorkspaceSync({save:async(state,revision)=>{if(failed)throw new Error('offline');return {revision:revision+1};},onStatus:s=>statuses.push(s)});
 sync.enqueue({value:1});await tick();assert.equal(sync.status,'offline');assert.equal(sync.revision,0);failed=false;sync.retry();await tick();assert.equal(sync.status,'saved');assert.equal(sync.revision,1);assert.ok(statuses.includes('offline'));
});
test('Conflicts block later writes instead of overwriting another device',async()=>{
 let calls=0;const sync=createWorkspaceSync({revision:2,save:async()=>{calls++;throw Object.assign(new Error(),{status:409});}});sync.enqueue({value:1});await tick();sync.enqueue({value:2});sync.retry();await tick();assert.equal(calls,1);assert.equal(sync.revision,2);assert.equal(sync.status,'conflict');
});
