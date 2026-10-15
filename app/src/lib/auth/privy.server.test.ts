import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, exportSPKI, exportJWK, SignJWT } from 'jose';
import { verifyPrivyIdentity } from './privy.server.ts';
function restoreEnv(saved:{id:string|undefined,key:string|undefined}){
 if(saved.id===undefined)delete process.env.PRIVY_APP_ID;else process.env.PRIVY_APP_ID=saved.id;
 if(saved.key===undefined)delete process.env.PRIVY_VERIFICATION_KEY;else process.env.PRIVY_VERIFICATION_KEY=saved.key;
}
describe('verifyPrivyIdentity',{concurrency:false},()=>{
it('verifies Privy signature, issuer, audience and expiry without trusting browser identity claims',async(t)=>{
 const saved={id:process.env.PRIVY_APP_ID,key:process.env.PRIVY_VERIFICATION_KEY};
 const {publicKey,privateKey}=await generateKeyPair('ES256');process.env.PRIVY_APP_ID='test-app';process.env.PRIVY_VERIFICATION_KEY=await exportSPKI(publicKey);
 t.mock.method(globalThis,'fetch',async()=>{assert.fail('static verification key must not fetch JWKS');});
 const token=(issuer='privy.io',aud='test-app',exp='1h')=>new SignJWT({sid:'fixture'}).setProtectedHeader({alg:'ES256'}).setSubject('did:privy:verified').setIssuer(issuer).setAudience(aud).setIssuedAt().setExpirationTime(exp).sign(privateKey);
 try {
 assert.deepEqual(await verifyPrivyIdentity(await token()),{provider:'privy',issuer:'privy.io/test-app',subject:'did:privy:verified'});
 await assert.rejects(verifyPrivyIdentity(await token('evil')));await assert.rejects(verifyPrivyIdentity(await token('privy.io','another-app')));await assert.rejects(verifyPrivyIdentity(await token('privy.io','test-app','-1h')));
 await assert.rejects(verifyPrivyIdentity('forged'));
 const other=await generateKeyPair('ES256');
 const wrongSignature=await new SignJWT({sid:'fixture'}).setProtectedHeader({alg:'ES256'}).setSubject('did:privy:verified').setIssuer('privy.io').setAudience('test-app').setIssuedAt().setExpirationTime('1h').sign(other.privateKey);
 await assert.rejects(verifyPrivyIdentity(wrongSignature));
 const missingSid=await new SignJWT({}).setProtectedHeader({alg:'ES256'}).setSubject('did:privy:verified').setIssuer('privy.io').setAudience('test-app').setIssuedAt().setExpirationTime('1h').sign(privateKey);
 await assert.rejects(verifyPrivyIdentity(missingSid));
 } finally {restoreEnv(saved);}
});
it('verifies rotated Privy JWKS keys when PRIVY_VERIFICATION_KEY is unset',async(t)=>{
 const saved={id:process.env.PRIVY_APP_ID,key:process.env.PRIVY_VERIFICATION_KEY};
 const appId='jwks-app', current=await generateKeyPair('ES256',{extractable:true}), previous=await generateKeyPair('ES256',{extractable:true}), unknown=await generateKeyPair('ES256',{extractable:true});
 const jwk=async(pair:Awaited<ReturnType<typeof generateKeyPair>>,kid:string)=>({...await exportJWK(pair.publicKey),kid,alg:'ES256',use:'sig'});
 const keys=[await jwk(current,'kid-current'),await jwk(previous,'kid-previous')];
 process.env.PRIVY_APP_ID=appId;delete process.env.PRIVY_VERIFICATION_KEY;
 t.mock.method(globalThis,'fetch',async(input:unknown)=>{
  assert.equal(String(input),`https://auth.privy.io/api/v1/apps/${appId}/jwks.json`);
  return new Response(JSON.stringify({keys}),{headers:{'content-type':'application/json'}});
 });
 const token=(privateKey:CryptoKey,kid:string,issuer='privy.io',aud=appId,exp='1h')=>new SignJWT({sid:'fixture'}).setProtectedHeader({alg:'ES256',kid}).setSubject('did:privy:verified').setIssuer(issuer).setAudience(aud).setIssuedAt().setExpirationTime(exp).sign(privateKey);
 const identity={provider:'privy' as const,issuer:`privy.io/${appId}`,subject:'did:privy:verified'};
 try {
  assert.deepEqual(await verifyPrivyIdentity(await token(current.privateKey,'kid-current')),identity);
  assert.deepEqual(await verifyPrivyIdentity(await token(previous.privateKey,'kid-previous')),identity);
  await assert.rejects(verifyPrivyIdentity(await token(unknown.privateKey,'kid-unknown')));
  await assert.rejects(verifyPrivyIdentity(await token(current.privateKey,'kid-current','evil')));
  await assert.rejects(verifyPrivyIdentity(await token(current.privateKey,'kid-current','privy.io','other-app')));
  await assert.rejects(verifyPrivyIdentity(await token(current.privateKey,'kid-current','privy.io',appId,'-1h')));
  const missingSid=await new SignJWT({}).setProtectedHeader({alg:'ES256',kid:'kid-current'}).setSubject('did:privy:verified').setIssuer('privy.io').setAudience(appId).setIssuedAt().setExpirationTime('1h').sign(current.privateKey);
  await assert.rejects(verifyPrivyIdentity(missingSid));
  delete process.env.PRIVY_APP_ID;
  await assert.rejects(verifyPrivyIdentity(await token(current.privateKey,'kid-current')),/not configured/);
 } finally {restoreEnv(saved);}
});
});
