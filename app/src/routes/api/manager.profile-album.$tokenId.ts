import { createFileRoute } from "@tanstack/react-router";
import { managerWalletFromRequest } from "@/lib/auth/manager-auth.server";
import { loadIdolByTokenId, loadIdolCatalog } from "@/lib/idol-catalog.server";
import { parseTokenIdParam } from "@/lib/token-id";
import { mediaUrlForId } from "@/lib/idol-overlay";
import { PROFILE_UPLOAD_MAX_BYTES, slotWritesThumbnail, typeWritesThumbnail } from "@/lib/image-aspect";
import {
  archiveNotionImagePages,
  ensureAlbumThumbnail,
  flagPoolRowAsCover,
  fetchNotionLibraryImages,
  replaceNotionPageImage,
  unflagCoverAlbumRows,
} from "@/lib/notion-images";
import { thumbUrl } from "@/lib/utils";
import {
  pickPoolImages,
  profileImageMatchesKind,
  sortProfileAlbumRows,
  type ProfileImageKind,
} from "@/lib/profile-album";

const KINDS = new Set<ProfileImageKind>(["avatar", "cover", "banner"]);

export const Route = createFileRoute("/api/manager/profile-album/$tokenId")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const tokenId = parseTokenIdParam(params.tokenId);
        const idol = tokenId ? await loadIdolByTokenId(tokenId) : undefined;
        if (!idol) return json({ error: "Unknown idol" }, 404);

        const auth = await managerWalletFromRequest(request, idol.tokenId);
        if ("error" in auth) return json({ error: auth.error }, auth.status);

        const url = new URL(request.url);
        const kind = String(url.searchParams.get("kind") ?? "");
        if (!KINDS.has(kind as ProfileImageKind)) {
          return json({ error: "kind must be avatar, cover, or banner" }, 400);
        }

        const images = await fetchNotionLibraryImages(idol.tokenId);
        if (kind === "cover" && url.searchParams.get("gallery") === "1") {
          const items = pickPoolImages(images, idol.tokenId).map((img) => ({
            pageId: img.pageId,
            mediaUrl: thumbUrl(mediaUrlForId(img.pageId)),
          }));
          return json({ items });
        }

        const matched = sortProfileAlbumRows(
          images.filter((img) => profileImageMatchesKind(img, kind as ProfileImageKind)),
        );
        if (slotWritesThumbnail(kind as ProfileImageKind)) {
          for (const img of matched) {
            await ensureAlbumThumbnail({
              tokenId: img.tokenId,
              pageId: img.pageId,
              hasThumbnail: img.hasThumbnail,
            });
          }
        }
        const items = matched.map((img) => ({
          pageId: img.pageId,
          mediaUrl: img.thumbnailUrl || thumbUrl(mediaUrlForId(img.pageId)),
        }));

        return json({ items });
      },
      POST: async ({ params, request }) => {
        const tokenId = parseTokenIdParam(params.tokenId);
        const idol = tokenId ? await loadIdolByTokenId(tokenId) : undefined;
        if (!idol) return json({ error: "Unknown idol" }, 404);

        const auth = await managerWalletFromRequest(request, idol.tokenId);
        if ("error" in auth) return json({ error: auth.error }, auth.status);

        let body: { pageIds?: string[]; kind?: string };
        try {
          body = (await request.json()) as { pageIds?: string[]; kind?: string };
        } catch {
          return json({ error: "Invalid JSON" }, 400);
        }
        if (body.kind !== "cover") return json({ error: "kind must be cover" }, 400);
        const pageIds = Array.from(
          new Set(
            (Array.isArray(body.pageIds) ? body.pageIds : []).filter(
              (id): id is string => typeof id === "string" && id.length > 0,
            ),
          ),
        );
        if (pageIds.length === 0) return json({ error: "pageIds required" }, 400);

        const library = await fetchNotionLibraryImages(idol.tokenId);
        const pool = pickPoolImages(library, idol.tokenId);
        let added = 0;
        for (const id of pageIds) {
          const row = pool.find((img) => img.pageId === id);
          if (!row) continue;
          if (await flagPoolRowAsCover(row)) added += 1;
        }
        if (added > 0) await loadIdolCatalog(true);
        return json({ ok: true, added });
      },
      DELETE: async ({ params, request }) => {
        const tokenId = parseTokenIdParam(params.tokenId);
        const idol = tokenId ? await loadIdolByTokenId(tokenId) : undefined;
        if (!idol) return json({ error: "Unknown idol" }, 404);

        const auth = await managerWalletFromRequest(request, idol.tokenId);
        if ("error" in auth) return json({ error: auth.error }, auth.status);

        let body: { pageIds?: string[]; kind?: string };
        try {
          body = (await request.json()) as { pageIds?: string[]; kind?: string };
        } catch {
          return json({ error: "Invalid JSON" }, 400);
        }
        const pageIds = Array.isArray(body.pageIds)
          ? body.pageIds.filter((id) => typeof id === "string" && id.length > 0)
          : [];
        if (pageIds.length === 0) return json({ error: "pageIds required" }, 400);

        const library = await fetchNotionLibraryImages(idol.tokenId);
        const allowed = library.filter((i) => pageIds.includes(i.pageId));
        if (body.kind === "cover") {
          const unflagged = await unflagCoverAlbumRows(allowed);
          if (unflagged > 0) await loadIdolCatalog(true);
          return json({ ok: true, archived: unflagged });
        }
        const archived = await archiveNotionImagePages(allowed.map((i) => i.pageId));
        if (archived > 0) await loadIdolCatalog(true);
        return json({ ok: true, archived });
      },
      PATCH: async ({ params, request }) => {
        const tokenId = parseTokenIdParam(params.tokenId);
        const idol = tokenId ? await loadIdolByTokenId(tokenId) : undefined;
        if (!idol) return json({ error: "Unknown idol" }, 404);

        const auth = await managerWalletFromRequest(request, idol.tokenId);
        if ("error" in auth) return json({ error: auth.error }, auth.status);

        let form: FormData;
        try {
          form = await request.formData();
        } catch {
          return json({ error: "Invalid form data" }, 400);
        }

        const pageId = String(form.get("pageId") ?? "");
        const fromPageId = String(form.get("fromPageId") ?? "");
        if (!pageId) return json({ error: "pageId required" }, 400);

        const library = await fetchNotionLibraryImages(idol.tokenId);
        const slot = library.find((i) => i.pageId === pageId);
        if (!slot) return json({ error: "Unknown image" }, 404);

        if (fromPageId) {
          const pool = library.find((i) => i.pageId === fromPageId);
          if (!pool) return json({ error: "Unknown image" }, 404);
          const flagged = await flagPoolRowAsCover(pool);
          if (!flagged) return json({ error: "Flag failed" }, 502);
          await unflagCoverAlbumRows([slot]);
          await loadIdolCatalog(true);
          return json({ ok: true, mediaUrl: mediaUrlForId(pool.pageId) });
        }

        const file = form.get("file");
        if (!(file instanceof File) || file.size === 0) {
          return json({ error: "file required" }, 400);
        }
        if (file.size > PROFILE_UPLOAD_MAX_BYTES) return json({ error: "Image must be under 2 MB" }, 400);
        if (!file.type.startsWith("image/")) return json({ error: "Image file required" }, 400);

        const bytes = Buffer.from(await file.arrayBuffer());
        const thumb = form.get("thumb");
        const thumbBytes =
          thumb instanceof File && thumb.size > 0
            ? Buffer.from(await thumb.arrayBuffer())
            : undefined;
        const ok = await replaceNotionPageImage({
          pageId,
          bytes,
          mime: file.type || "image/jpeg",
          filename: `${idol.tokenId}-profile-${pageId.slice(0, 8)}.jpg`,
        });
        if (!ok) return json({ error: "Replace failed" }, 502);
        if (typeWritesThumbnail(slot.type)) {
          await ensureAlbumThumbnail({
            tokenId: slot.tokenId,
            pageId: slot.pageId,
            bytes: thumbBytes ?? bytes,
            replaceExisting: true,
          });
        }

        await loadIdolCatalog(true);
        return json({ ok: true, mediaUrl: mediaUrlForId(slot.pageId) });
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
