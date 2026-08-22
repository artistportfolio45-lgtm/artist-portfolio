# Runtime Public Portfolio Architecture

## Result

Normal artwork, profile, website-settings, Home Hero, and About changes now update a site-wide Netlify Blob. They do not start a Netlify build. The checked-in `frontend/public/data/portfolio.json` remains build-time SEO input only and is not rendered by the runtime Gallery.

```text
Admin -> Render API -> MongoDB -> sanitized snapshot
      -> signed HTTPS POST -> Netlify sync Function
      -> portfolio-public-data/current

Visitor -> GET /api/public-portfolio -> Netlify read Function -> current Blob
        -> Cloudinary image URLs load directly from Cloudinary
```

If the Blob read is temporarily unavailable, the browser makes one controlled fallback request to Render at `GET /api/public-data`. If both sources fail, the public page keeps its neutral loading/error state and offers Retry; it does not render an old bundled portfolio.

## Endpoints and storage

- Public: `GET /api/public-portfolio`, redirected to `/.netlify/functions/public-portfolio`.
- Netlify write: `POST /.netlify/functions/sync-public-portfolio`, authenticated with HMAC-SHA256.
- Render fallback: `GET /api/public-data`, sanitized and read-only.
- Admin retry/initial seed: `POST /api/public-data/sync`, JWT-protected and admin-only.
- Explicit SEO regeneration: `POST /api/public-data/rebuild-seo`, admin-only and requiring `{ "confirmation": "REGENERATE_SEO" }`.
- Blob store/key: `portfolio-public-data/current`.

The snapshot contains schema/version metadata, `generatedAt`, count, published public artwork fields, derived categories and collections, public profile, public settings/Home Hero, and public About content. Drafts and management/private fields are excluded by the Render generator and rejected again by the Netlify writer.

## Required environment variables

Netlify Function runtime:

```text
PUBLIC_DATA_SYNC_SECRET=<strong random secret, at least 32 characters>
```

Render backend:

```text
PUBLIC_DATA_SYNC_URL=https://artistportfolio46.netlify.app/.netlify/functions/sync-public-portfolio
PUBLIC_DATA_SYNC_SECRET=<the exact same secret>
```

Optional Render variable, used only for an explicitly requested SEO rebuild:

```text
NETLIFY_BUILD_HOOK_URL=<existing Netlify build hook, or leave unset>
```

Never create `VITE_PUBLIC_DATA_SYNC_SECRET`; any `VITE_` variable is bundled into browser JavaScript. Never put a real secret in `.env.example`, Git, screenshots, or frontend requests.

## Generate and configure the secret

Generate 48 random bytes in PowerShell and copy the Base64 result to a password manager:

```powershell
[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
```

1. In Netlify, open the site, then **Project configuration -> Environment variables**. Add `PUBLIC_DATA_SYNC_SECRET` for the Functions runtime.
2. In Render, open the backend service, then **Environment**. Add `PUBLIC_DATA_SYNC_URL` and the identical `PUBLIC_DATA_SYNC_SECRET`.
3. Save the Render variables so the backend restarts with them.

## One-time deployment and initial seed

1. Deploy this code to Netlify once. This code deployment installs `@netlify/blobs`, publishes both Functions, and applies the `/api/public-portfolio` redirect.
2. Confirm `GET https://artistportfolio46.netlify.app/api/public-portfolio` returns the controlled `PUBLIC_DATA_NOT_SEEDED` 503 before the first seed, or the current JSON if already seeded.
3. Sign in to `/admin` and select **Sync Public Data** in the sidebar. This calls the authenticated `POST /api/public-data/sync` endpoint. **Retry Public Sync** also appears in the warning banner after any failed automatic synchronization.
4. Refresh `/api/public-portfolio`. Confirm HTTP 200 and verify `snapshotVersion`, `generatedAt`, and `artworkCount`.

Tests do not call production services, write real Blobs, edit production MongoDB, or delete Cloudinary assets.

## Verify content changes without a deployment

1. Note the most recent Netlify deploy time and current `snapshotVersion`.
2. Create or edit a harmless test artwork through Admin; publish it only when ready.
3. Open a new private browser window and load Gallery. Confirm the update appears without waking Render for normal browsing.
4. Unpublish or delete the test artwork. Refresh the private window and confirm it disappears without an old-card flash or an early “Image unavailable” state.
5. For bulk upload/delete and Stop Now, confirm the admin job reports one final public synchronization and that its final counts match MongoDB outcomes.
6. Return to Netlify **Deploys** and confirm no new deploy/build was created by these content actions.

Deletion ordering is MongoDB change, authoritative Blob sync, then Cloudinary cleanup. If the Blob sync fails, the admin receives: “Artwork changes were saved, but public Gallery synchronization failed.” Cloudinary cleanup is withheld so the older public snapshot cannot point at an already-deleted image. Use **Retry Public Sync** before further cleanup investigation.

## Logs, Blob inspection, and usage

- Function logs: Netlify site -> **Logs & Metrics -> Functions**, then inspect `public-portfolio` and `sync-public-portfolio`.
- Blob contents: Netlify site -> **Blobs**, open `portfolio-public-data`, then inspect `current`. Confirm only published/public fields are present.
- No-build check: Netlify site -> **Deploys**. A sync appears in Function logs but must not create a deploy entry.
- Credit-based usage: team **Usage & billing -> General -> Credit usage breakdown -> Compute**; use **Usage & billing -> Account usage insights -> Compute** for trends, and project **Logs & Metrics -> Observability** for request-level details.
- Legacy Free-plan usage: project **Project configuration -> Functions -> Overview -> Usage**, with per-function details under **Logs & Metrics -> Functions**.

The frontend makes one snapshot request, shares the promise/data in memory across public views, uses ETag conditional validation, and does not poll. Images remain direct Cloudinary requests. Netlify Functions do not query MongoDB, and ordinary Blob success avoids Render entirely.

## Security and reliability

- HMAC-SHA256 covers the exact body, timestamp, and random nonce.
- Five-minute timestamp and replay windows reject expired/replayed writes.
- Constant-time signature comparison avoids timing leaks.
- The writer enforces JSON content type, 5 MiB body limit, 2,000-artwork limit, schema/version/count checks, unique IDs, published status, HTTPS image URLs, and forbidden private/management fields.
- The complete `current` value is replaced in one Blob write; readers never assemble per-artwork records.
- Render retries at most three times with short bounded backoff and reuses the same deterministic snapshot version.
- The read Function is same-origin, does not add permissive CORS, uses strong consistency, ETag/304, and controlled 503 responses.

## SEO limitation and remaining operational risk

Runtime pages are current immediately after a successful sync, but build-generated sitemap/static artwork metadata can remain stale until the next code deployment or the explicit SEO regeneration action. This affects crawler-facing build artifacts, not the runtime Gallery.

When MongoDB deletion succeeds but Blob synchronization fails, Cloudinary deletion is intentionally skipped to prevent broken public image URLs. This can leave an orphaned Cloudinary asset that needs manual review after public sync is restored; visitor correctness is preserved. A permanently unavailable Blob plus a sleeping/unavailable Render fallback produces the intentional Retry state rather than showing stale data.
