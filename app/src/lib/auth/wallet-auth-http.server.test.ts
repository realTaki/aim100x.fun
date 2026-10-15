import { afterEach, beforeEach, it } from "node:test";
import assert from "node:assert/strict";
import { privateKeyToAccount } from "viem/accounts";
import { decodeJwt, SignJWT } from 'jose';
import { sessionSigningKey } from './app-wallet.server.ts';
import { parseSiweMessage } from 'viem/siwe';
import { verifyMessage } from "viem";
import { handleWalletAuthRequest, sessionUserFromRequest, type AuthDeps } from "./wallet-auth-http.server.ts";
import { memoryAuthStore } from "./auth-test-store.ts";
import { deriveAppWallet } from "./app-wallet.server.ts";
const signer=privateKeyToAccount(('0x'+'01'.repeat(32)) as `0x${string}`), origin='https://aim100x.fun';
const saved={key:process.env.WALLET_MASTER_SECRET,rp:process.env.MERA_RP_ID,app:process.env.PRIVY_APP_ID};
beforeEach(()=>{process.env.WALLET_MASTER_SECRET='33'.repeat(32);process.env.MERA_RP_ID='aim100x.fun';process.env.PRIVY_APP_ID='test-app';});
afterEach(()=>{for(const [name,value] of Object.entries({WALLET_MASTER_SECRET:saved.key,MERA_RP_ID:saved.rp,PRIVY_APP_ID:saved.app})) {if(value===undefined)delete process.env[name];else process.env[name]=value;}});
function req(path:string,body:unknown,cookie?:string,source=origin){return new Request(origin+'/api/auth/'+path,{method:'POST',headers:{origin:source,'Content-Type':'application/json',...(cookie?{cookie}:{})},body:JSON.stringify(body)});}
function dependencies():AuthDeps{return {store:memoryAuthStore(),verifySignature:(message,signature,address)=>verifyMessage({message,signature,address})};}
async function challenge(deps:AuthDeps,provider='wallet'){
 const res=await handleWalletAuthRequest(req('wallet/challenge',{provider,address:signer.address}),deps);assert.equal(res.status,200);
 return {message:(await res.json()).message as string,cookie:res.headers.getSetCookie()[0].split(';')[0]};
}
async function login(deps:AuthDeps,provider='wallet'){
 const c=await challenge(deps,provider),signature=await signer.signMessage({message:c.message});
 const res=await handleWalletAuthRequest(req('wallet/verify',{message:c.message,signature},c.cookie),deps);assert.equal(res.status,200);
 return {cookie:res.headers.getSetCookie()[0].split(';')[0],body:await res.json(),c,signature};
}
it('browser and Mera use independently verified namespaces; login never delegates or sends funds',async()=>{
 const deps=dependencies(), a=await login(deps), b=await login(deps,'mera'), again=await login(deps);
 assert.equal(a.body.user.walletAddress,deriveAppWallet(signer.address).account.address);
 assert.equal(a.body.user.id,again.body.user.id);assert.notEqual(a.body.user.id,b.body.user.id);assert.notEqual(a.body.user.walletAddress,b.body.user.walletAddress);
 assert.ok(await sessionUserFromRequest(new Request(origin,{headers:{cookie:a.cookie}}),deps.store));
});
it('consumes each challenge atomically and rejects replay, tampering, cross-origin and other signers',async()=>{
 const deps=dependencies(), a=await login(deps);
 assert.equal((await handleWalletAuthRequest(req('wallet/verify',{message:a.c.message,signature:a.signature},a.c.cookie),deps)).status,401);
 const c=await challenge(deps), wrong=privateKeyToAccount(('0x'+'02'.repeat(32)) as `0x${string}`);
 for(const [message,signature] of [[c.message,await wrong.signMessage({message:c.message})],[c.message+'x',a.signature]])
 assert.equal((await handleWalletAuthRequest(req('wallet/verify',{message,signature},c.cookie),deps)).status,401);
 assert.equal((await handleWalletAuthRequest(req('wallet/challenge',{address:signer.address},undefined,'https://evil.aim100x.fun'),deps)).status,403);
});
it('Privy ignores client subject and only accepts the server-verified identity in configured app namespace',async()=>{
 const deps=dependencies();deps.verifyPrivy=async()=>({provider:'privy',issuer:'privy.io/test-app',subject:'did:privy:verified'});
 const c=await challenge(deps,'privy');
 const r=await handleWalletAuthRequest(req('wallet/verify',{message:c.message,accessToken:'fixture',subject:'did:privy:attacker'},c.cookie),deps);
 assert.equal(r.status,200);assert.equal((await r.json()).user.identity.subject,'did:privy:verified');
 const other=await challenge(deps,'privy');deps.verifyPrivy=async()=>({provider:'privy',issuer:'privy.io/other-app',subject:'did:privy:verified'});
 assert.equal((await handleWalletAuthRequest(req('wallet/verify',{message:other.message,accessToken:'fixture'},other.cookie),deps)).status,401);
});
it('requires a live cookie session for product operations and revokes it at logout',async()=>{
 const deps=dependencies();let calls=0;deps.execute=async user=>{calls++;return {accountId:user.id};};
 assert.equal((await handleWalletAuthRequest(req('wallet/send',{}),deps)).status,401);
 const a=await login(deps);
 assert.equal((await handleWalletAuthRequest(req('wallet/send',{},a.cookie),deps)).status,200);assert.equal(calls,1);
 await handleWalletAuthRequest(req('sign-out',{},a.cookie),deps);
 assert.equal((await handleWalletAuthRequest(req('wallet/send',{},a.cookie),deps)).status,401);assert.equal(calls,1);
});

it('uses testnet login challenges and rejects expired challenges and concurrent replay',async()=>{
 const deps=dependencies(),c=await challenge(deps);
 assert.equal(parseSiweMessage(c.message).chainId,10143);
 const signature=await signer.signMessage({message:c.message});
 const results=await Promise.all([1,2].map(()=>handleWalletAuthRequest(req('wallet/verify',{message:c.message,signature},c.cookie),deps)));
 assert.deepEqual(results.map(r=>r.status).sort(),[200,401]);
 const fresh=await challenge(deps);
 const claims=decodeJwt(fresh.cookie.slice(fresh.cookie.indexOf('=')+1));
 const expired=await new SignJWT({...claims,exp:Math.floor(Date.now()/1000)-10}).setProtectedHeader({alg:'HS256'}).sign(sessionSigningKey());
 assert.equal((await handleWalletAuthRequest(req('wallet/verify',{message:fresh.message,signature:await signer.signMessage({message:fresh.message})},fresh.cookie.split('=')[0]+'='+expired),deps)).status,401);
});
it('rejects Mera RP mismatch and leaves mainnet initialization disabled after login',async()=>{
 const deps=dependencies();process.env.MERA_RP_ID='another.domain';
 assert.equal((await handleWalletAuthRequest(req('wallet/challenge',{provider:'mera',address:signer.address}),deps)).status,503);
 const a=await login(deps);
 assert.equal((await handleWalletAuthRequest(req('wallet/prepare',{},a.cookie),deps)).status,503);
});

it('Mera defaults to the production RP without environment settings and retains account derivation',async()=>{
 const explicit=await login(dependencies(),'mera');
 delete process.env.MERA_RP_ID;
 const defaulted=await login(dependencies(),'mera');
 assert.equal(defaulted.body.user.identity.issuer,'aim100x.fun');
 assert.equal(defaulted.body.user.id,explicit.body.user.id);
 assert.equal(defaulted.body.user.walletAddress,explicit.body.user.walletAddress);
});
it('rejects preview and insecure Mera challenges before creating a challenge record',async()=>{
 delete process.env.MERA_RP_ID;
 const deps=dependencies();deps.store!.challenge=async()=>{assert.fail('Rejected origin must not persist a challenge');};
 for(const source of ['https://preview.vercel.app','http://aim100x.fun','https://evilaim100x.fun']){
  const request=new Request(source+'/api/auth/wallet/challenge',{method:'POST',headers:{origin:source,'Content-Type':'application/json'},body:JSON.stringify({provider:'mera',address:signer.address})});
  assert.equal((await handleWalletAuthRequest(request,deps)).status,503);
 }
});
it('returns explicit challenge config errors and logs the final catch',async()=>{
 const logs:string[]=[];
 const original=console.error;
 console.error=(...args:unknown[])=>{logs.push(args.map(String).join(' '));};
 try{
  delete process.env.WALLET_MASTER_SECRET;
  const secretRes=await handleWalletAuthRequest(req('wallet/challenge',{provider:'privy'}),dependencies());
  assert.equal(secretRes.status,503);
  assert.match((await secretRes.json()).error,/WALLET_MASTER_SECRET/);
  process.env.WALLET_MASTER_SECRET='33'.repeat(32);

  const deps=dependencies();
  deps.store!.challenge=async()=>{throw new Error('AIM100X_DATABASE_URL is required for the media library');};
  const dbRes=await handleWalletAuthRequest(req('wallet/challenge',{provider:'wallet',address:signer.address}),deps);
  assert.equal(dbRes.status,503);
  assert.match((await dbRes.json()).error,/AIM100X_DATABASE_URL/);

  deps.store!.challenge=async()=>{throw Object.assign(new Error('relation "aim_auth_challenges" does not exist'),{code:'42P01'});};
  const tableRes=await handleWalletAuthRequest(req('wallet/challenge',{provider:'privy'}),deps);
  assert.equal(tableRes.status,503);
  assert.match((await tableRes.json()).error,/auth:init/);
  assert.ok(logs.some((line)=>line.includes('[wallet-auth]')&&!/postgres:\/\//i.test(line)));

  const logged=await login(dependencies());
  logs.length=0;
  assert.equal((await handleWalletAuthRequest(req('wallet/prepare',{},logged.cookie),dependencies())).status,503);
  assert.ok(logs.some((line)=>line.includes('[wallet-auth]')&&/Mainnet spending/.test(line)));
 }finally{console.error=original;}
});
it('auth init script creates the login challenge table',async()=>{
 const {readFileSync}=await import('node:fs');
 const schema=readFileSync(new URL('./account-store.server.ts',import.meta.url),'utf8');
 const init=readFileSync(new URL('../../../scripts/initialize-auth-storage.ts',import.meta.url),'utf8');
 assert.match(schema,/CREATE TABLE IF NOT EXISTS aim_auth_challenges/);
 assert.match(init,/initializeAuthSchema/);
});
