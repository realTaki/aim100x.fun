import { useEffect, useState, type ComponentProps } from "react";
import { Link } from "@tanstack/react-router";
import { Globe, SlidersHorizontal, Upload } from "lucide-react";
import { CoverAlbumGrid } from "@/components/cover-album-grid";
import { InlineFieldEditor } from "@/components/inline-field-editor";
import { ManagerCoverAlbum } from "@/components/manager-cover-album";
import { IdolLinkButtons } from "@/components/idol-link-buttons";
import { IdolProfileShell } from "@/components/idol-profile-shell";
import { LightEditSheet } from "@/components/light-edit-sheet";
import { ProfileEditAffordance } from "@/components/profile-edit-affordance";
import { ProfileImageAlbumSheet } from "@/components/profile-image-album-sheet";
import { idolBio, idolName } from "@/lib/idol-fields";
import { useManagerIdolEditor } from "@/lib/use-manager-idol-editor";
import { idolDisplayStrip, type ProfileImageKind } from "@/lib/profile-album";

function OwnerEdit({
  canEdit,
  ...props
}: { canEdit: boolean } & ComponentProps<typeof ProfileEditAffordance>) {
  if (!canEdit) return null;
  return <ProfileEditAffordance {...props} />;
}

export function ManagerIdolEditScreen({ tokenId }: { tokenId: number | null }) {
  const { idol, missing, loading, canEdit, persistNamed, reloadIdol } =
    useManagerIdolEditor(tokenId);
  const [albumKind, setAlbumKind] = useState<ProfileImageKind | null>(null);
  const [draftWebsite, setDraftWebsite] = useState("");
  const [draftTwitter, setDraftTwitter] = useState("");
  const [linksOpen, setLinksOpen] = useState(false);

  useEffect(() => {
    if (!idol) return;
    setDraftWebsite(idol.website);
    setDraftTwitter(idol.twitter);
  }, [idol]);

  function openAlbum(kind: ProfileImageKind) {
    if (!canEdit) return;
    setAlbumKind(kind);
  }

  if (missing) {
    return (
      <main className="flex h-full min-h-0 flex-col items-center justify-center overflow-hidden px-6 text-center">
        <p className="text-sm text-muted">Couldn't find this idol.</p>
        <Link to="/me/manager" className="mt-4 text-sm text-accent underline">
          Back to creator center
        </Link>
      </main>
    );
  }

  if (loading || !idol) {
    return (
      <main className="flex h-full min-h-0 items-center justify-center overflow-hidden">
        <div className="size-10 animate-pulse rounded-full bg-surface-2" />
      </main>
    );
  }

  const displayName = idolName(idol);
  const bioText = idolBio(idol);
  const strip = idolDisplayStrip(idol);

  return (
    <>
      <IdolProfileShell
        backTo="/me/manager"
        stripSrc={strip.src}
        avatarSrc={idol.avatar}
        onBannerClick={canEdit ? () => openAlbum("banner") : undefined}
        onAvatarClick={canEdit ? () => openAlbum("avatar") : undefined}
        bannerBadge={
          <OwnerEdit
            canEdit={canEdit}
            label="Upload banner"
            icon={Upload}
            onClick={() => openAlbum("banner")}
            className="absolute right-3 bottom-3 z-30"
          />
        }
        avatarBadge={
          <OwnerEdit
            canEdit={canEdit}
            label="Upload avatar"
            icon={Upload}
            onClick={() => openAlbum("avatar")}
            className="absolute -right-1 -bottom-1 size-7 border-border/80"
          />
        }
        headerRight={
          <div className="absolute top-[max(0.75rem,env(safe-area-inset-top))] right-3 z-20 flex items-center gap-1.5">
            <IdolLinkButtons tokenId={idol.tokenId} />
            <OwnerEdit
              canEdit={canEdit}
              label="Edit links"
              onClick={() => {
                setDraftWebsite(idol.website);
                setDraftTwitter(idol.twitter);
                setLinksOpen(true);
              }}
            />
          </div>
        }
        actions={
          canEdit ? (
            <Link
              to="/me/manager/$tokenId/advanced"
              params={{ tokenId: String(idol.tokenId) }}
              className="flex h-10 shrink-0 items-center justify-center rounded-full bg-surface-2 px-3 text-fg ring-1 ring-border transition-colors hover:bg-surface-3"
              aria-label="Advanced settings"
            >
              <SlidersHorizontal className="size-4" strokeWidth={1.75} />
            </Link>
          ) : null
        }
        name={
          <div className="mt-2">
            <InlineFieldEditor
              canEdit={canEdit}
              saved={displayName}
              maxLength={48}
              label="Name"
              className="break-words text-2xl leading-tight font-semibold tracking-tight"
              onSave={async (next) => {
                if (!next) throw new Error("Name cannot be empty.");
                if (next === idol.name.trim()) return;
                await persistNamed({ name: next });
              }}
            />
          </div>
        }
        bio={
          <div className="mt-3">
            <InlineFieldEditor
              canEdit={canEdit}
              saved={bioText}
              multiline
              maxLength={500}
              label="Bio"
              className="text-md leading-relaxed text-fg/88"
              onSave={async (next) => {
                if (next === idolBio(idol)) return;
                await persistNamed({ bio: next });
              }}
            />
          </div>
        }
        links={
          <IdolLinkButtons
            website={idol.website}
            twitter={idol.twitter}
            tokenId={idol.tokenId}
            share={false}
            compact
            className="mt-3"
          />
        }
        subscriberCount={idol.subscriberCount}
        receiptsUsdc={idol.receiptsUsdc}
        album={
          canEdit ? (
            <ManagerCoverAlbum
              tokenId={idol.tokenId}
              refreshKey={idol.covers.join()}
              onChanged={() => void reloadIdol()}
            />
          ) : (
            <CoverAlbumGrid tokenId={idol.tokenId} refreshKey={idol.covers.join()} />
          )
        }
      />

      {canEdit && albumKind ? (
        <ProfileImageAlbumSheet
          open={Boolean(albumKind)}
          onOpenChange={(open) => {
            if (!open) setAlbumKind(null);
          }}
          tokenId={idol.tokenId}
          kind={albumKind}
          onChanged={() => void reloadIdol()}
        />
      ) : null}

      <LightEditSheet
        open={canEdit && linksOpen}
        onOpenChange={(open) => {
          if (!open) setLinksOpen(false);
        }}
        title="Links"
        closeOnSuccess
        onSave={async () => {
          await persistNamed({
            website: draftWebsite.trim(),
            twitter: draftTwitter.trim(),
          });
        }}
      >
        <div className="flex items-center gap-2">
          <Globe className="size-4 shrink-0 text-muted" strokeWidth={1.75} aria-hidden />
          <input
            value={draftWebsite}
            onChange={(e) => setDraftWebsite(e.target.value)}
            maxLength={200}
            className="lf-search min-w-0 flex-1 py-3"
            autoFocus
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>
        <div className="mt-3 flex items-center gap-2">
          <svg
            viewBox="0 0 24 24"
            aria-hidden
            className="size-4 shrink-0 text-muted"
            fill="currentColor"
          >
            <path d="M14.2 10.43 20.5 3h-1.7l-5.46 6.46L9.05 3H3.5l6.62 9.64L3.5 21h1.7l5.77-6.83L14.9 21h5.55l-6.25-10.57ZM11.7 13.2l-.67-.96-5.3-7.57h2.28l4.28 6.12.67.96 5.56 7.94h-2.28L11.7 13.2Z" />
          </svg>
          <input
            value={draftTwitter}
            onChange={(e) => setDraftTwitter(e.target.value)}
            maxLength={200}
            className="lf-search min-w-0 flex-1 py-3"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>
      </LightEditSheet>
    </>
  );
}
