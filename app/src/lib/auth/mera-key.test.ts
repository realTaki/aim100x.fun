import { it } from 'node:test';
import assert from 'node:assert/strict';
import { createSecp256k1SigningSession } from '@category-labs/mera';
import { toViemAccount } from '@category-labs/mera/viem';
import { verifyMessage } from 'viem';
import { meraLoginKey } from './mera-key.ts';
it('Mera login proof is deterministic, RP-scoped and the signing session is ended',async()=>{
 const prf=new Uint8Array(32).fill(7), key=await meraLoginKey(prf,'aim100x.fun');
 assert.deepEqual(key,await meraLoginKey(prf,'aim100x.fun'));
 assert.notDeepEqual(key,await meraLoginKey(prf,'another.domain'));
 const session=createSecp256k1SigningSession({privateKey:key}), account=toViemAccount(session);key.fill(0);
 const signature=await account.signMessage({message:'fixture challenge'});
 assert.equal(await verifyMessage({address:account.address,message:'fixture challenge',signature}),true);
 session.end();await assert.rejects(account.signMessage({message:'again'}));
 await assert.rejects(meraLoginKey(new Uint8Array(1),'aim100x.fun'));
});

it('uses the shared production RP default while preserving explicit RP namespaces and strict origins',async()=>{
 const {DEFAULT_MERA_RP_ID,resolveMeraRpId,assertMeraOrigin,meraOriginError}=await import('./mera-config.ts');
 assert.equal(DEFAULT_MERA_RP_ID,'aim100x.fun');
 for(const value of [undefined,'','  '])assert.equal(resolveMeraRpId(value),'aim100x.fun');
 assert.equal(resolveMeraRpId('login.example.com'),'login.example.com');
 for(const value of ['https://aim100x.fun','aim100x.fun:443','aim100x.fun/path','-bad.example.com','Aim100x.fun'])assert.throws(()=>resolveMeraRpId(value),/hostname/);
 for(const origin of ['https://aim100x.fun','https://www.aim100x.fun'])assert.doesNotThrow(()=>assertMeraOrigin(origin,DEFAULT_MERA_RP_ID));
 for(const origin of ['http://aim100x.fun','https://evilaim100x.fun','https://aim100x.fun.evil.com','https://preview.vercel.app'])assert.throws(()=>assertMeraOrigin(origin,DEFAULT_MERA_RP_ID),/RP domain/);
 assert.match(meraOriginError('https://preview.vercel.app')!,/aim100x.fun/);
 assert.equal(meraOriginError('https://login.example.com','login.example.com'),null);
});
