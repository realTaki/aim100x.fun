import { initializeAuthSchema } from "../src/lib/auth/account-store.server.ts";
import { initializeProductSchema } from "../src/lib/auth/product-wallet.server.ts";
await initializeAuthSchema();
await initializeProductSchema();
console.log("Authentication and product operation schemas initialized.");
