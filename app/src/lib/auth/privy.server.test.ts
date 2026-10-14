import { it } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, exportSPKI, SignJWT } from 'jose';
import { verifyPrivyIdentity } from './privy.server.ts';
it('verifies Privy signature, issuer, audience and expiry without trusting browser identity claims',async()=>{
 const saved={id:process.env.PRIVY_APP_ID,key:process.env.PRIVY_VERIFICATION_KEY};
 const {publicKey,privateKey}=await generateKeyPair('ES256');process.env.PRIVY_APP_ID='test-app';process.env.PRIVY_VERIFICATION_KEY=await exportSPKI(publicKey);
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
 } finally {if(saved.id===undefined)delete process.env.PRIVY_APP_ID;else process.env.PRIVY_APP_ID=saved.id;if(saved.key===undefined)delete process.env.PRIVY_VERIFICATION_KEY;else process.env.PRIVY_VERIFICATION_KEY=saved.key;}
});
