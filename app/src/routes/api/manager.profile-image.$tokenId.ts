import { createFileRoute } from "@tanstack/react-router";
import { managerWalletFromRequest } from "@/lib/auth/manager-auth.server";
import { loadIdolByTokenId, loadIdolCatalog } from "@/lib/idol-catalog.server";
import { publishIdolProfileImage } from "@/lib/notion-images";
import { parseTokenIdParam } from "@/lib/token-id";
import { PROFILE_UPLOAD_MAX_BYTES } from "@/lib/image-aspect";
import { mediaUrlForId } from "@/lib/idol-overlay";

const KINDS = new Set(["avatar", "cover", "banner"]);

export const Route = createFileRoute("/api/manager/profile-image/$tokenId")({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        const tokenId = parseTokenIdParam(params.tokenId);
        const idol = tokenId ? await loadIdolByTokenId(tokenId) : undefined;
        if (!idol) {
          return json({ error: "Unknown idol" }, 404);
        }

        const auth = await managerWalletFromRequest(request, idol.tokenId);
        if ("error" in auth) {
          return json({ error: auth.error }, auth.status);
        }

        let form: FormData;
        try {
          form = await request.formData();
        } catch {
          return json({ error: "Invalid form data" }, 400);
        }

        const kind = String(form.get("kind") ?? "");
        if (!KINDS.has(kind)) {
          return json({ error: "kind must be avatar, cover, or banner" }, 400);
        }

        const file = form.get("file");
        if (!(file instanceof File) || file.size === 0) {
          return json({ error: "file required" }, 400);
        }
        if (file.size > PROFILE_UPLOAD_MAX_BYTES) {
          return json({ error: "Image must be under 2 MB" }, 400);
        }
        if (!file.type.startsWith("image/")) {
          return json({ error: "Image file required" }, 400);
        }

        const bytes = Buffer.from(await file.arrayBuffer());
        const thumb = form.get("thumb");
        const thumbBytes =
          thumb instanceof File && thumb.size > 0
            ? Buffer.from(await thumb.arrayBuffer())
            : undefined;
        const published = await publishIdolProfileImage({
          tokenId: idol.tokenId,
          kind: kind as "avatar" | "cover" | "banner",
          bytes,
          mime: file.type || "image/jpeg",
          thumbBytes,
        });
        if (!published) {
          return json({ error: "Image upload failed" }, 502);
        }

        await loadIdolCatalog(true);

        return json({
          ok: true,
          pageId: published.pageId,
          mediaUrl: mediaUrlForId(published.pageId),
        });
      },
    },
  },
});

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
