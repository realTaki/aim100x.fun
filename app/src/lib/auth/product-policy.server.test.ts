import { it } from 'node:test';
import assert from 'node:assert/strict';
import { decodeFunctionData, erc20Abi, parseAbi, type Address } from 'viem';
import { planProductAction, type PolicyReader } from './product-policy.server.ts';
import { IDOLS100X_ADDRESS, LONELY_USD_ADDRESS } from '../idols100x.ts';
const wallet=('0x'+'11'.repeat(20)) as Address, other=('0x'+'22'.repeat(20)) as Address, tba=('0x'+'33'.repeat(20)) as Address;
const reader:PolicyReader={owner:async()=>wallet,price:async()=>1_000_000n,tba:async()=>tba,balance:async()=>5_000_000n,image:async()=>{throw new Error('Invalid image ticket');}};
it('constructs exact bounded approval and product calldata; no arbitrary targets or native transfers',async()=>{
 const calls=await planProductAction({kind:'subscribe',tokenId:1,maxAmount:'1000000'},wallet,reader);
 assert.equal(calls[0].to,LONELY_USD_ADDRESS);assert.equal(calls[1].to,IDOLS100X_ADDRESS);
 assert.deepEqual(decodeFunctionData({abi:erc20Abi,data:calls[0].data}).args,[IDOLS100X_ADDRESS,1_000_000n]);
 assert.ok(calls.every(c=>c.value===0n));
 for(const raw of [{kind:'transfer',to:other},{kind:'mint',maxAmount:'20000000',to:other},{kind:'tip',tokenId:1,amount:'1000000001'},{kind:'tip',tokenId:1,amount:'0'},{kind:'subscribe',tokenId:1,maxAmount:'1'}]) await assert.rejects(planProductAction(raw,wallet,reader));
});
it('requires the APP owner for edits/withdrawal and forces withdrawals back to that APP wallet',async()=>{
 await assert.rejects(planProductAction({kind:'sale',tokenId:1,amount:'0'},other,reader),/owner/);
 await assert.rejects(planProductAction({kind:'withdraw',tokenId:1},other,reader),/owner/);
 const [call]=await planProductAction({kind:'withdraw',tokenId:1},wallet,reader);assert.equal(call.to,tba);
 const outer=decodeFunctionData({abi:parseAbi(['function execute(address,uint256,bytes,uint8)']),data:call.data});
 assert.equal(outer.args[0],LONELY_USD_ADDRESS);assert.equal(outer.args[1],0n);
 const inner=decodeFunctionData({abi:erc20Abi,data:outer.args[2]});assert.deepEqual(inner.args,[wallet,5_000_000n]);
});
it('only authorizes the explicit agent and supported role; image payments require a signed quote',async()=>{
 await assert.rejects(planProductAction({kind:'agent',agent:other,role:3},wallet,reader));
 await assert.rejects(planProductAction({kind:'agent',agent:wallet,role:2},wallet,reader));
 await assert.rejects(planProductAction({kind:'image',imageId:'x',paymentIntent:'forged'},wallet,reader),/ticket/);
 const calls=await planProductAction({kind:'agent',agent:other,role:1},wallet,reader);assert.equal(calls.length,1);assert.equal(calls[0].to,IDOLS100X_ADDRESS);
});
