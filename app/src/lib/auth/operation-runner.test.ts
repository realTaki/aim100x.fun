import { it } from 'node:test';
import assert from 'node:assert/strict';
import { runProductOperation, type OperationStore, type OperationResult } from './operation-runner.ts';
const hash=('0x'+'11'.repeat(32)) as `0x${string}`;
function fixture(){
 let row:(OperationResult & {bodyHash:string})|null=null, locked=false, sends=0;
 const store:OperationStore={lookup:async()=>row,lock:async()=>{if(locked)return false;locked=true;return true;},begin:async()=>{row={status:'pending',hashes:[],bodyHash:'body'};},hashes:async h=>{row!.hashes=h;},status:async s=>{row!.status=s;},release:async()=>{locked=false;}};
 const chain={sign:async()=>hash,send:async()=>{assert.deepEqual(row!.hashes,[hash]);sends++;},confirmed:async()=>true};
 return {store,chain,sends:()=>sends,locked:()=>locked};
}
it('persists hashes before broadcast and returns a confirmed retry without signing or sending',async()=>{
 const f=fixture();assert.equal((await runProductOperation('body',async()=>[1],f.store,f.chain)).status,'confirmed');
 assert.equal((await runProductOperation('body',async()=>{throw new Error('must not plan');},f.store,f.chain)).status,'confirmed');
 assert.equal(f.sends(),1);assert.equal(f.locked(),false);
 await assert.rejects(runProductOperation('different',async()=>[1],f.store,f.chain),/another operation/);
});
it('lost receipts retain the lock and repeated requests never pay twice',async()=>{
 const f=fixture();f.chain.confirmed=async()=>{throw new Error('timeout');};
 assert.equal((await runProductOperation('body',async()=>[1],f.store,f.chain)).status,'pending');
 assert.equal((await runProductOperation('body',async()=>[1],f.store,f.chain)).status,'pending');
 assert.equal(f.sends(),1);assert.equal(f.locked(),true);
});
it('does not broadcast if durable hash storage fails, or if session/signing fails',async()=>{
 const f=fixture();f.store.hashes=async()=>{throw new Error('db unavailable');};
 await runProductOperation('body',async()=>[1],f.store,f.chain);assert.equal(f.sends(),0);assert.equal(f.locked(),true);
 const g=fixture();g.chain.sign=async()=>{throw new Error('session revoked');};
 assert.equal((await runProductOperation('body',async()=>[1],g.store,g.chain)).status,'failed');assert.equal(g.sends(),0);assert.equal(g.locked(),false);
});
