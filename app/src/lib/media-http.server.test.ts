import assert from "node:assert/strict";
import { it } from "node:test";
import { handleMediaRequest } from "./media-http.server.ts";

it("streams public R2 thumbnails without disclosing signed storage links", async () => {
  let fetched = "";
  const deps = {
    resolve: async () => ({
      image: "https://private.r2.example/original?signed=secret",
      thumbnail: "https://private.r2.example/thumb?signed=secret",
    }),
    session: async () => null,
    fetch: (async (input) => {
      fetched = String(input);
      return new Response("thumbnail", { headers: { "Content-Type": "image/webp" } });
    }) as typeof fetch,
  };
  const result = await handleMediaRequest(
    new Request("https://aim100x.fun/api/media/id?size=thumb"),
    "id",
    deps,
  );
  assert.equal(result.status, 200);
  assert.equal(fetched, "https://private.r2.example/thumb?signed=secret");
  assert.equal(await result.text(), "thumbnail");
  assert.equal(result.headers.get("location"), null);
  assert.equal(result.headers.get("content-type"), "image/webp");
  assert.equal(result.headers.get("cache-control"), "private, no-store");
});
it("returns 502 for a missing R2 object without redirecting to storage", async () => {
  const deps = {
    resolve: async () => ({ image: "https://private.r2.example/missing" }),
    session: async () => null,
    fetch: (async () => new Response("missing", { status: 404 })) as typeof fetch,
  };
  const result = await handleMediaRequest(
    new Request("https://aim100x.fun/api/media/id"),
    "id",
    deps,
  );
  assert.equal(result.status, 502);
  assert.equal(result.headers.get("location"), null);
});
