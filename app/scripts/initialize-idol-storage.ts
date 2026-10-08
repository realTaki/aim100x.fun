import { initializeMediaSchema, mediaStorageConfigured } from "../src/lib/media-storage.server.ts";
import { initializeIdolConfigSchema } from "../src/lib/idol-config.server.ts";
if (!mediaStorageConfigured())
  throw new Error("Configure Neon and private R2 before initializing idol storage");
await initializeMediaSchema();
await initializeIdolConfigSchema();
console.log("Initialized idol configuration and scoped media schemas. No account tables.");
