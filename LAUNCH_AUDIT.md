# Artist Portfolio Launch Audit

Audit date: 2026-08-21

## Launch verdict

The current local code is suitable for a release candidate, but the currently deployed Netlify site must be rebuilt before launch.

The opening-page image problem has a confirmed cause: the deployed static snapshot contains 231 artworks while the live backend and current local snapshot contain 216. Of the 15 stale deployed records, 13 point to Cloudinary images that now return HTTP 404. The site initially renders those stale records and later replaces them with live data, which is why visitors can briefly see unavailable images.

Deploying the current frontend snapshot removes those deleted records. The current gallery also keeps a loading skeleton visible, falls back from optimized images to originals, and retries transient image failures before showing an error.

## Verification completed

- Reviewed the frontend and backend source, configuration, routes, models, services, scripts, and tests.
- Verified all 216 current artwork originals and all 216 optimized Cloudinary URLs: every request returned HTTP 200.
- Cloudinary cold optimized-image response times were 0.8-4.0 seconds, with a median of about 1.3 seconds.
- Added an early Cloudinary preconnect so image requests start with less connection overhead.
- Tested `/`, `/gallery`, `/about`, `/contact`, an artwork detail page, and `/admin/login` in production Chrome builds.
- Tested at a true 390px mobile viewport: no horizontal overflow was found.
- Verified mobile navigation, featured preview, gallery filter dialog, artwork preview/zoom, and inquiry-form controls.
- Production build succeeds and generates SEO pages for all 216 published artworks.
- Frontend tests: 26 passing.
- Backend tests: 46 passing.
- Frontend and backend production dependency audits: 0 known vulnerabilities after dependency updates.
- No `git diff --check` whitespace errors.

## Features present

### Public website

- Responsive desktop sidebar, mobile header menu, bottom mobile navigation, skip link, and back-to-top control.
- Home hero with configurable copy and calls to action.
- Featured artwork carousel with quick preview and detail links.
- Latest-work responsive masonry gallery.
- Gallery category navigation, search, availability filter, collection/medium/year/decade filters, sorting, pagination, and mobile load-more behavior.
- Gallery scroll and page restoration after returning from artwork details.
- Responsive Cloudinary image transformations, intrinsic aspect ratios, loading skeletons, original-image fallback, and bounded retries.
- Artwork detail pages with metadata, availability, pricing, description expansion, provenance, exhibition history, publications, related works, and previous/next navigation.
- Full-screen artwork preview with keyboard controls, zoom, pan, swipe, and multi-image navigation.
- Artwork-specific enquiry form.
- About page with hero, statement, biography, practices, timeline, public works, awards, press/archive viewer, studio/process content, and closing calls to action.
- Contact page with artwork selection, validated contact form, contact information, and social links.
- Netlify Forms backup for contact and artwork enquiries.
- Configurable color themes, maintenance mode, logo, contact details, social links, and website copy.
- Static-first public data with background live refresh for resilience during backend cold starts.
- Per-page metadata, canonical URLs, Open Graph/Twitter tags, structured data, sitemap, robots file, and generated 404 page.

### Administration

- Password login followed by Authenticator verification when enabled and email OTP verification.
- Session-only browser token storage and server-side session revocation after security changes.
- Dashboard summary.
- Artist profile editing and profile-photo upload.
- Draft/published About-page editor with repeatable sections, media uploads, ordering, duplication, previews, and publishing.
- Artwork creation/editing with multiple images, publication status, availability, featured status, metadata, and catalogue fields.
- Bulk artwork upload with client-side optimization, bounded concurrency, pause/stop/resume, interrupted-session recovery, idempotent upload IDs, and batch history.
- Artwork list filtering, page selection, bulk deletion, image deletion, and public rebuild triggering.
- Inquiry inbox with search, read/unread status, detail view, and deletion.
- Activity log with module filters and pagination.
- Security settings for password changes, Authenticator enrollment/removal, and recovery-code regeneration.
- Site settings for content, contact details, themes, SEO, logo, social links, and maintenance mode.

### Backend and operations

- Express/MongoDB API with publication-aware public artwork routes.
- Cloudinary upload, transformation, and deletion integration.
- JWT issuer/audience/algorithm restrictions and versioned session invalidation.
- Encrypted TOTP secrets, hashed one-time email codes, hashed single-use recovery codes, login lockout, and rate limiting.
- CORS, CSP, HSTS, content-type, referrer, permissions, and framing controls.
- Gmail API email OTP delivery.
- MongoDB index checks and upload idempotency.
- Static snapshot export and debounced Netlify rebuild hooks.

## Launch-critical fixes made during this audit

- Removed an encryption-key-looking value from the tracked `.env.example` file.
- Fixed session-version fields being omitted from login, security, and admin-seed queries. Without this fix, a user could receive an immediately invalid token after a password or 2FA change.
- Updated the vulnerable backend `ip-address` dependency used by rate limiting.
- Updated React Router to 7.18.2 and the Vite/PostCSS toolchain to patched versions.
- Added Cloudinary preconnect and DNS-prefetch hints.
- Routed artwork-detail enquiries into the backend admin inbox, with Netlify Forms retained as a backup.
- Escaped admin inquiry searches, bounded search length, bounded pagination, and added invalid-ID handling.

## Manual actions required before launch

### Priority 0 - required

1. Deploy the backend changes to Render first, then deploy the frontend to Netlify.
2. Confirm Netlify's new `/data/portfolio.json` contains 216 artworks (or the current live count), not 231, and has a new `generatedAt` timestamp.
3. Open the deployed home and gallery in a private/incognito window and confirm no stale or unavailable image appears before live refresh.
4. Submit one test from the Contact page and one from an artwork detail page. Confirm both appear in Admin > Inquiries and in Netlify Forms.
5. Log in through the complete production flow: password, Authenticator if enabled, email OTP, dashboard, and logout.

### Render environment

- `NODE_ENV=production`
- `MONGO_URI` targets the exact `artistPortfolio` database.
- `JWT_SECRET` is random, at least 32 characters, and unique.
- `TOTP_ENCRYPTION_KEY` is random, at least 32 characters, and different from `JWT_SECRET`.
- Gmail client ID, client secret, refresh token, and `GMAIL_SENDER` are correct.
- Cloudinary cloud name, API key, and API secret are correct.
- `FRONTEND_URL` is the exact final Netlify/custom-domain origin.
- `BACKEND_URL` is the exact Render API origin.
- `NETLIFY_BUILD_HOOK_URL` is configured and a manual admin rebuild succeeds.
- `PUBLIC_DATA_EXPORT_KEY` is configured if the protected aggregate snapshot endpoint is used.
- Ensure `SEED_ADMIN_ON_START` and `RESET_ADMIN_2FA_ON_START` are off after any one-time recovery work.

The former example TOTP value matches the current local development value but was not present in Git `HEAD`. Do not commit or share the real `.env`. Rotate it only if the working copy or value was shared outside this machine; rotating it requires the documented one-time 2FA reset and re-enrollment process.

### Netlify environment and deployment

- `VITE_API_URL=https://artist-portfolio-0kkz.onrender.com/api` (or the final backend URL).
- Set `PUBLIC_SITE_URL`/`VITE_SITE_URL` to the final public origin, especially if using a custom domain.
- If using the protected aggregate snapshot endpoint, set the same `PUBLIC_DATA_EXPORT_KEY` on Netlify.
- Confirm both Netlify forms are detected: `contact` and `artwork-inquiry`.
- Confirm `_headers`, `_redirects`, generated artwork pages, `sitemap.xml`, `robots.txt`, and `404.html` are present in the deploy output.
- If moving to a custom domain, update CORS, CSP `connect-src`, generated canonical URLs, and the About preview origin before launch.

### Content and business checks

- Confirm all 216 works are intentionally published; the current gallery has only one category (`Uncategorized`).
- Replace filename-derived titles where needed and review year, medium, dimensions, price, availability, featured state, and catalogue number.
- Review all About-page facts, dates, award claims, archive images, captions, and source links.
- Confirm artist name, profile photo, biography, email, phone, WhatsApp, address, and every social link.
- Confirm website title, description, hero copy, footer, SEO title/description/keywords, logo, and selected theme.
- Confirm maintenance mode is off.
- Save current 2FA recovery codes somewhere secure and test one recovery path before launch.
- Back up MongoDB and confirm Cloudinary assets are retained under the expected folders.

## Residual limitations

- A real external network image cannot be literally instantaneous on a first uncached visit. The current implementation minimizes the delay and prevents a false unavailable message during normal transient loading.
- Bulk uploads intentionally have no file-count or per-file limit. The endpoint is admin-authenticated and the browser optimizes large images, but an authenticated oversized upload can still consume backend memory. Add a practical server limit later if very large originals are not required.
- The exact admin CRUD, Gmail delivery, Netlify form receipt, database writes, and Cloudinary mutations require production credentials and must be covered by the manual tests above; this audit did not create/delete production data.
