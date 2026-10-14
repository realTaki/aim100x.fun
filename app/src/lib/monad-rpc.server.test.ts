import { it } from 'node:test';
import assert from 'node:assert/strict';
import { alchemyRpcUrl, handleRpcProxy } from './monad-rpc.server.ts';
it('requires the exact Alchemy network and never falls back to public RPC',()=>{
 const env={ALCHEMY_MONAD_MAINNET_RPC_URL:'https://monad-mainnet.g.alchemy.com/v2/test-key',ALCHEMY_MONAD_TESTNET_RPC_URL:'https://monad-testnet.g.alchemy.com/v2/test-key'};
 assert.match(alchemyRpcUrl(143,env),/monad-mainnet/);assert.match(alchemyRpcUrl(10143,env),/monad-testnet/);
 assert.throws(()=>alchemyRpcUrl(143,{}),/ALCHEMY_MONAD_MAINNET/);
 assert.throws(()=>alchemyRpcUrl(1,env),/Unsupported/);
 assert.throws(()=>alchemyRpcUrl(143,{...env,ALCHEMY_MONAD_MAINNET_RPC_URL:env.ALCHEMY_MONAD_TESTNET_RPC_URL}),/mainnet/);
 assert.throws(()=>alchemyRpcUrl(143,{...env,ALCHEMY_MONAD_MAINNET_RPC_URL:'https://rpc.monad.xyz'}),/Alchemy/);
});
it('browser RPC forwards only bounded read methods and sanitizes upstream errors',async()=>{
 const request=(method:string,params:unknown[]=[])=>new Request('https://aim100x.fun/api/rpc?chainId=10143',{method:'POST',body:JSON.stringify({jsonrpc:'2.0',id:7,method,params})});
 let calls=0;const rpc=async(chain:number)=>{calls++;assert.equal(chain,10143);return '0x279f';};
 assert.equal((await handleRpcProxy(request('eth_chainId'),rpc)).status,200);
 for(const method of ['eth_sendRawTransaction','eth_sign','eth_sendUserOperation','eth_getLogs']) assert.equal((await handleRpcProxy(request(method),rpc)).status,400);
 assert.equal(calls,1);
 const error=await handleRpcProxy(request('eth_call'),async()=>{throw new Error('secret-url');});
 assert.equal(error.status,503);assert.doesNotMatch(await error.text(),/secret-url/);
});
