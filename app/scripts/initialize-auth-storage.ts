import { initializeAuthSchema } from "../src/lib/auth/account-store.server.ts";
import { initializeProductSchema } from "../src/lib/auth/product-wallet.server.ts";
import { initializeTextChatSchema } from "../src/lib/testnet-chat-store.server.ts";
import { initializeGasSchema } from "../src/lib/auth/testnet-gas.server.ts";
await initializeAuthSchema();
await initializeProductSchema();
await initializeTextChatSchema();
await initializeGasSchema();
console.log(
  "Authentication, product operations, text billing and gas allowance schemas initialized.",
);
