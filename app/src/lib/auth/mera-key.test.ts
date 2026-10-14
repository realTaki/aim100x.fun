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
