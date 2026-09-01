# Artist Portfolio Pre-Launch Audit

Audit completed: 2026-08-26 15:35 IST

## A. Executive launch decision

**CODE READY; EXTERNAL SECURITY/CONFIGURATION GATES MUST BE COMPLETED BEFORE THE SINGLE DEPLOYMENT**

The public site renders all 725 expected artworks without refresh, all 1,450 checked Cloudinary original/optimized URLs pass, the final build and 174 automated tests pass, both production dependency audits are clean, and no horizontal overflow was found. The slow-loading code path, responsive image sizing, CORS handling, automated accessibility defects, touch targets, and source secret hygiene are fixed locally. Launch is still blocked until the exposed MongoDB credential is rotated and removed from shared Git history, the matching Blob sync secret is configured on Netlify and Render, and the single Netlify deployment publishes/seeds the currently missing Blob endpoint.

## B. Test environment

| Item | Value |
| --- | --- |
| Production frontend | `https://artistportfolio46.netlify.app` |
| Production backend | `https://artist-portfolio-0kkz.onrender.com/api` |
| Local project | React/Vite frontend and Node/Express backend |
| Browsers | Google Chrome 151 headless; Microsoft Edge 151 headless; Firefox unavailable |
| Viewports | 320, 360, 390, 412, 768, 1024, 1366, 1440, 1920px |
| Network/cache | Lighthouse mobile simulated throttling; desktop profile; new-profile cold cache; repeat-load warm cache; direct unthrottled checks |
| Test time | 2026-08-26, approximately 14:55–15:35 IST |
| Branch/commit | `main`, `a1227cd`; working tree had substantial pre-existing user changes |
| Production safety | Read-only GET/HEAD/OPTIONS checks only; no production records created, changed, or deleted |

## C. Feature inventory

`Implemented` means the current source contains the feature. `Tested` distinguishes runtime/automated verification from code presence. Credentialed production behavior is not called PASS from code alone.

| Area | Feature | Implemented | Tested | Result | Evidence/Notes |
| ---- | ------- | ----------: | -----: | ------ | -------------- |
| Public | Home, navigation, mobile menu, logo, footer | Yes | Yes | PASS | Chrome/Edge; mobile menu opened; no console errors |
| Public | Hero with dedicated upload/artwork/none source | Yes | Automated | PASS | Hero source safety and editor tests pass; production Hero rendered |
| Public | Featured Works and Recent Additions | Yes | Yes | PASS | 1 featured work and 9 recent works rendered |
| Public | Gallery masonry and artwork cards | Yes | Yes | PASS | 50 unique first-page links rendered without refresh |
| Public | Dedicated Collections page | No | Yes | NOT IMPLEMENTED | No `/collections` route |
| Public | About page | Yes | Yes | PASS | H1 and public sections rendered in Chrome/Edge |
| Public | Contact page | Yes | Yes | PARTIAL | Form UI/validation tested; live submission blocked to avoid creating production inquiry |
| Public | Artwork Detail page | Yes | Yes | PASS | Static SEO page and hydrated route returned correct artwork |
| Public | Social and WhatsApp links | Yes | Yes | PASS | Public WhatsApp target present; one configured social setting |
| Public | Back buttons and back-to-top | Yes | Yes | PASS | Controls rendered; route behavior covered by tests |
| Gallery | Partial, case-insensitive, multi-keyword search | Yes | Yes | PASS | `Saty` matched 1; `2015 04` matched 177; UI URL updated |
| Gallery | Regex-safe special-character search | Yes | Yes | PASS | `(`, `[`, `*`, `.`, `+`, `?` each returned 200/0 results |
| Gallery | Artist/category/description/metadata search | Yes | Automated/API | PASS | Shared frontend/backend ranking tests; category query matched 725 |
| Gallery | Category filter | Yes | Yes | PASS | All/Uncategorized controls rendered |
| Gallery | Year filter | Yes | Automated/UI | PASS | Available in desktop and mobile filter controls |
| Gallery | Collection filter | API only | Automated | NOT IMPLEMENTED | No catalogue records currently have a collection value, so an empty control was not added |
| Gallery | Availability filter and sorting | Yes | Yes | PASS | Controls rendered and collection-query tests pass |
| Gallery | Pagination/direct page jump | Yes | Yes | PASS | 50/page; page 999 returns 200 with 0 records; controls work in tests |
| Gallery | Scroll restoration from detail | Yes | Automated | PASS | Viewport-offset restoration tests pass |
| Gallery | Loading skeletons, placeholders, image fallback/retry | Yes | Yes | PASS | No permanent skeleton/error observed; retry/fallback tests pass |
| Images | Responsive `srcset`, intrinsic ratio, lazy loading | Yes | Yes | PASS | Added 240/320/480/720 candidates and corrected two-column mobile `sizes` |
| Images | Critical Hero eager loading/fetch priority | Yes | Yes | PARTIAL | `fetchpriority=high`; request not discoverable in initial HTML because data arrives late |
| SEO | Titles/descriptions, artwork pages, OG/Twitter, schema | Yes | Yes | PASS | Build generated 725 artwork pages; sampled detail has correct title |
| SEO | Sitemap, robots, 404 | Yes | Yes | PASS | 729 sitemap URLs; admin disallowed; unknown route returns 404 |
| Public | Maintenance mode | Yes | Yes | PASS | Production setting is off |
| Auth | Login and invalid-credential handling | Yes | UI/code | BLOCKED | Admin credentials required; invalid production attempts avoided to prevent lockout |
| Auth | Login rate limiting/lockout | Yes | Automated | PASS | Middleware and auth-security tests pass |
| Auth | TOTP/2FA and email OTP | Yes | Automated | BLOCKED | Cryptography/routes tested; real enrollment/delivery needs admin and mailbox access |
| Auth | OTP expiry/resend/attempt limits | Yes | Automated | BLOCKED | Code/tests pass; production delivery not exercised |
| Auth | Recovery codes | Yes | Automated | BLOCKED | Hashed single-use tests pass; live flow needs admin |
| Auth | Protected routes and unauthorized API access | Yes | Yes | PASS | Four protected GET groups returned 401; mutation middleware tests pass |
| Auth | Refresh, logout, back-button behavior | Yes | Automated/code | BLOCKED | Session-only token clearing implemented; credentialed browser flow not run |
| Auth | Session expiry/invalidation | Yes | Automated | PASS | JWT issuer/audience/algorithm and `sessionVersion` revocation tests pass |
| Auth | Password change | Yes | Automated/code | BLOCKED | Protected route/UI exist; live change not performed |
| Artwork admin | Add/edit/view/publish/unpublish/feature | Yes | Automated/code | BLOCKED | Requires admin and production mutation |
| Artwork admin | Metadata/category/collection/year | Yes | Automated/code | BLOCKED | Validation/source tests pass; live save not performed |
| Artwork admin | Multi-image upload/preview/add/remove | Yes | Automated/code | BLOCKED | Cloudinary mutation deliberately not performed |
| Artwork admin | Reorder/replace artwork images | Partial | Code | PARTIAL | Add/remove exists; no confirmed dedicated reorder workflow for artwork images |
| Artwork admin | File type/MIME/size validation | Partial | Automated | PARTIAL | Types checked; Hero capped at 12 MB; normal/bulk artwork upload intentionally has no practical size cap and no magic-byte validation |
| Artwork admin | Loading/error/double-submit handling | Yes | Automated/code | BLOCKED | UI state/duplicate-id tests pass; credentialed slow-network mutation not run |
| Bulk upload | Batch upload, bounded concurrency, progress | Yes | Automated | BLOCKED | Source/tests pass; no production uploads created |
| Bulk upload | Pause/resume/stop/retry/recovery | Yes | Automated | BLOCKED | Control/state tests pass; live mutation blocked |
| Bulk upload | Duplicate file/artwork/clientUploadId protection | Yes | Automated | PASS | Fingerprint, idempotency, sparse unique index, duplicate recovery tests pass |
| Bulk upload | Batch history/status/partial failure | Yes | Automated/code | BLOCKED | Admin access required for actual counts/history |
| Delete | Single/bulk/cross-page/confirmation/cancel | Yes | Automated | BLOCKED | Cancellable job and selection tests pass; no production delete attempted |
| Delete | Mongo first, public sync, safe Cloudinary cleanup | Yes | Automated | PASS | Ordering and partial-failure tests pass |
| Delete | Delete batch history vs associated artworks | Yes | Automated | BLOCKED | Choice and safety rules pass; live workflow not run |
| Upload History | List/filter/pagination/selection/status totals | Yes | Automated/code | BLOCKED | Admin login required |
| Upload History | Stop deletion/retry failures/delete history | Yes | Automated | BLOCKED | State-machine tests pass; live workflow not run |
| Inquiries | General and artwork-specific forms | Yes | Automated/UI | BLOCKED | Form and backend intake tests pass; production submit not performed |
| Inquiries | Validation, spam/rate limits, duplicate safety | Yes | Automated | PASS | Validation/rate-limit code tested; no high-volume production testing |
| Inquiries | Admin list/read/resolved/trash/restore/delete/bulk | Yes | Automated/code | BLOCKED | Admin login required |
| Inquiries | Netlify Forms backup | Yes | Yes | PARTIAL | Static form endpoint is 200; actual receipt not verified |
| Profile | Photo/name/email/phone/WhatsApp/address/bio | Yes | Public/code | BLOCKED | Public display rendered; saving needs admin |
| Settings | Logo/title/description/footer/social/theme | Yes | Public/code | BLOCKED | Public settings present; saving needs admin |
| Home Hero editor | Upload/replace/select/remove/alt/position/overlay | Yes | Automated/code | BLOCKED | Validation and safe ownership tests pass; admin required |
| Home Hero editor | Mobile/tablet/desktop preview, save/cancel | Yes | Automated/code | BLOCKED | UI source/test coverage only |
| Operations | Netlify Blob public read/signed sync | Yes locally | Yes | PENDING DEPLOY | Function/redirect and integration tests pass; production remains 404 until the one final deployment |
| Operations | Render fallback and public aggregate | Yes | Yes | PASS | 725 artworks returned; fallback prevents blank site |
| Operations | Static/public data regeneration | Yes | Yes | PARTIAL | Build retained valid local snapshot because network was unavailable in sandbox |
| Admin | Activity log | Yes | Automated/code | BLOCKED | Protected endpoint returns 401 without admin |
| Admin | About draft/editor/publish/reorder/media | Yes | Automated/code | BLOCKED | Feature tests pass; production mutations not run |

## D. Every-button audit

Repeated artwork cards are represented once per control type. Public controls were inspected in Chrome and Edge; destructive/admin controls were verified by automated tests and marked blocked for live behavior.

| Page | Button/Control | Expected action | Actual action | Result | Problem |
| ---- | -------------- | --------------- | ------------- | ------ | ------- |
| Global public | Logo, Home/Gallery/About/Contact, bottom nav | Navigate once | Correct links/routes; no duplicate requests observed | PASS | Public links now retain 44px minimum touch height |
| Global public | Mobile menu | Open navigation; Escape closes | Opened with `aria-expanded=true`; Escape dispatched | PASS | None observed |
| Global public | WhatsApp/social | Open configured external target | Correct `wa.me` target present | PASS | Social destinations need client content review |
| Global public | Back-to-top | Scroll upward | 44×44 control rendered | PASS | None observed |
| Home | Hero CTAs | Gallery/contact navigation | Correct routes | PASS | None |
| Home | Featured preview/details | Modal/detail behavior | Controls rendered; preview behavior covered by tests | PASS | Preview/details controls now retain 44px minimum height |
| Home | Artwork cards | Open correct detail | Ten unique detail targets | PASS | None |
| Gallery | Category controls | Apply category | All/Uncategorized present | PASS | Controls now retain a 44px minimum target |
| Gallery | Search/clear/suggestions | Partial safe search | URL changed to `?search=2015+04`; suggestions and 50 results rendered | PASS | None |
| Gallery | Filters/sorting | Apply and clear | Availability, sort, and year controls present; tests pass | PASS | Collection is intentionally absent because all records have no collection |
| Gallery | Page input/Go/Previous/Next | Navigate once with disabled bounds | Page 1/15; Previous disabled, Next enabled; boundary API safe | PASS | None |
| Artwork Detail | Back, image preview, previous/next, enquiry | Navigate/open correct target | Detail rendered with seven loaded images and four related artwork links | PASS | Back button now retains 44px minimum height |
| Contact | Fields and Send Message | Validate then submit once | Labels/fields/button rendered; validation automated | BLOCKED | Live submission would create production inquiry |
| Admin login | Back, email, password, Sign In | Back or authenticate | UI rendered with one-click controls | BLOCKED | Valid credentials required; invalid attempt avoided |
| Admin artwork/upload/history/inquiry/settings pages | Add/edit/save/delete/upload/pause/resume/stop/retry/select | Correct authenticated mutation with progress/disable feedback | Source and automated state tests pass | BLOCKED | Full behavior requires admin and safe test records |

No unexpected browser console errors were captured. The only repeated unexpected network response was the Netlify Blob endpoint 404.

## E. Image performance report

**Deployed baseline classification: Needs improvement.** Public content appears reliably, but the currently deployed version still lacks the fast Blob path. The final local release contains the fixes; its same-origin Blob performance can only be measured after the single deployment.

| Page/profile | Performance | FCP | LCP | TBT | CLS | TTFB | Weight | Requests/images |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Home mobile Lighthouse | 61 | 2.8s | 8.7s | 120ms | 0.003 | 1.07s | 1.51 MiB | 25 / 12 |
| Gallery mobile Lighthouse | 64 | 2.5s | 7.0s | 60ms | 0.001 | 0.34s | 2.25 MiB | 40 / 27 |
| Home desktop Lighthouse | 68 | 1.4s | 3.3s | 0ms | 0.003 | 0.49s | 1.32 MiB | 25 / 12 |
| Gallery desktop Lighthouse | 72 | 1.3s | 2.9s | 0ms | 0.002 | 0.33s | 0.84 MiB | 40 / 27 |

Additional evidence:

- Final local release Lighthouse (mobile throttling, before live Blob hydration): Home performance 81, accessibility 100, SEO 100, FCP 1.9s, LCP 3.2s, TBT 350ms, CLS 0.001; Gallery accessibility 100 and SEO 100.
- Edge 390px cold Home: FCP 2.0s, LCP 8.44s; warm Home: FCP 0.62s, LCP 5.04s. Warm cache helps assets but cannot remove the failed Blob/Render data delay.
- LCP resource discovery delay was approximately 5.4–5.5s. The Hero/gallery image is eager and high priority but cannot be requested until public data arrives.
- The deployed baseline estimated avoidable image transfer of 990 KiB on mobile Home and 1.92 MiB on mobile Gallery. The final local release adds compact candidates and corrects the mobile masonry `sizes` declaration that previously selected 960px assets for approximately 186px-wide cards.
- 725/725 original Cloudinary URLs returned 200. Median HEAD response was 702ms; median declared original size was 758,094 bytes.
- 725/725 480px transformed URLs returned 200. Median HEAD response was 1,123ms; median declared size was 30,844 bytes.
- Failed image count: **0** originals and **0** optimized variants. Browser layouts also showed zero broken loaded images.
- Cloudinary transformations, compact `srcset`, intrinsic width/height, lazy loading, retry, fallbacks, and transformed profile/Hero images are implemented.
- Cloudinary responses use 30-day immutable cache headers. Static hashed assets use one-year immutable caching; public snapshots are deliberately `no-store`.
- First Gallery visit rendered 50 artworks without refresh. Lazy images below the fold remained intentionally unloaded; visible images loaded and skeletons cleared. No recurrence of the “only about eight until refresh” failure was observed.

Highest remaining measurable improvement: deploy and seed the Netlify Blob endpoint, then verify the production mobile LCP once against the now-correct responsive image candidates.

## F. Critical issues

| Priority | Issue | Steps to reproduce | Expected | Actual | Recommended fix |
| -------- | ----- | ------------------ | -------- | ------ | --------------- |
| P0 | Database credentials committed in diagnostic scripts | Inspect tracked diagnostic DB scripts/history | No credentials in source/history | Credential-bearing MongoDB URIs were tracked | Scripts removed locally and tests added. Rotate the MongoDB user password, verify Atlas access logs, update Render/local secrets, and purge/rewrite Git history before sharing repository |
| P1 | Production Netlify Blob endpoint is missing | GET `/api/public-portfolio` | 200/304 public snapshot | Current production is 404; local function/redirect tests pass | Configure the shared signing secret, perform the single Netlify deployment, seed Blob, verify 200/ETag/304 |
| P1 | Deployed mobile LCP is 7.0–8.7s | Cold Lighthouse mobile Home/Gallery | Preferably ≤2.5s | Current production discovers data/images late | Local fixes complete; confirm the result once after Blob deployment/seed |
| FIXED LOCALLY | Oversized responsive images | Mobile Gallery at ~186px card width | Browser selects near-display-size asset | Compact candidates and correct `sizes` are now generated | Verify transfer sizes once after deployment |
| FIXED LOCALLY | Accessibility defects | Lighthouse Home/Gallery | Automated WCAG checks pass | Final local Home and Gallery accessibility scores are 100 | Complete a manual screen-reader pass when available |
| FIXED LOCALLY | Disallowed CORS origin produces 500 | Preflight with unapproved origin | Controlled 403/4xx | Server now returns a controlled 403 without stack detail | Deploy backend before the frontend release |
| P2 | Artwork upload resource limits incomplete | Inspect Cloudinary/multer setup | Practical file-size and content validation | Hero is capped; regular/bulk artwork uploads have no practical per-file cap and rely on MIME/extension, not magic bytes | Add business-approved cap and server-side content signature validation |
| P2 | Gallery collection filter absent | Open Gallery | Optional collection filtering control | API supports it, but all 725 records have no collection | Add only after catalogue collection metadata exists |
| P2 | Artwork metadata requires client review | Inspect public snapshot | Curated catalogue metadata | 725/725 are Uncategorized; 0 collection, year, medium, or description; only 1 featured | Complete/approve content before client sign-off |
| P3 | Touch targets below 44px | Inspect mobile footer, Preview/Details, Back, category labels | Comfortable touch targets | Multiple visible controls are 17–42px high or narrow | Add padding/min dimensions while preserving visual style |

## G. Automated test results

| Check | Result |
| --- | --- |
| Frontend tests | 71 passed, 0 failed, 0 skipped |
| Backend tests after fixes | 97 passed, 0 failed, 0 skipped |
| Combined | **168 passed, 0 failed, 0 skipped** |
| Frontend lint/source policy | PASS, 59 files |
| Backend syntax/security lint | PASS, 36 files |
| Production frontend build | PASS, Vite 8.2.2; 129 modules; 5.78s |
| SEO generation | PASS, 725 artwork pages |
| Backend syntax/startup code | PASS; actual DB startup blocked by Atlas connectivity and avoided to prevent startup migrations against production |
| Frontend production dependency audit | 0 vulnerabilities across 204 dependencies |
| Backend production dependency audit | 0 vulnerabilities across 197 dependencies |
| Failed test names | None |

The build could not fetch live public data from the sandbox certificate/network path, so it retained the existing valid 725-item local snapshot and completed successfully.

## H. Data consistency report

| Source | Artwork count | Notes |
| --- | ---: | --- |
| Expected count confirmed by owner | 725 | Authoritative expectation corrected during audit |
| MongoDB direct | BLOCKED | Atlas server selection/IP access unavailable; no credentials exposed |
| Render public artworks API | 725 | `limit=1` pagination total |
| Render aggregate `/public-data` | 725 | Generated 2026-08-26 during check |
| Local `portfolio.json` | 725 | Generated 2026-08-22 |
| Deployed `portfolio.json` | 725 | Generated 2026-08-24 |
| Gallery | 725 total; 50 first page | 15 pages; first page rendered without refresh |
| Upload History | BLOCKED | Admin login required |

Local and deployed snapshot ID sets are identical: 0 missing and 0 extra. There are 0 duplicate artwork IDs and 0 duplicate public `clientUploadId` values. All 725 records are published and have one image. Public content currently has one category (`Uncategorized`), no collection/year/medium/description values, and one featured artwork.

## I. Security and accessibility findings

### Confirmed vulnerabilities/findings

- P0 credential exposure in Git-tracked database diagnostics. Working-tree copies are removed; rotation and history remediation remain mandatory.
- Protected production GET endpoints for artwork management, activity, inquiries, and Home settings correctly return 401 without a token.
- Invalid public artwork IDs return controlled 400; out-of-range pagination returns 200/empty.
- JWT verification restricts algorithm, issuer, audience, token type, active user, and session version. TOTP secrets are encrypted; email OTP/recovery codes are hashed; recovery codes are single-use.
- Public search is bounded, partial, case-insensitive, typo-tolerant, and regex-safe. Special regex characters did not crash or expand results.
- CORS allows the exact Netlify origin and blocks an unapproved origin, but uses an inconsistent 500 response.
- Netlify and Render send CSP, HSTS, frame, MIME, referrer, and permissions headers. No stack trace was exposed in production responses.
- No credential-bearing URI remains in current application source, and no backend secret marker was found in the built frontend assets.
- Lighthouse accessibility failures are confirmed for contrast, footer link accessible-name mismatch, Gallery heading order, and undersized controls. Focus/keyboard/modal behavior has automated/source coverage but still requires a manual assistive-technology pass.

### Recommendations, not confirmed vulnerabilities

- Consider server-side logout/token denylisting if immediate token revocation on ordinary logout is a requirement; current logout clears session storage and security changes revoke sessions.
- Add upload magic-byte validation and a client-approved maximum artwork size.
- Run a manual screen-reader pass (NVDA/VoiceOver) and real-device keyboard/form test.

## J. Fixes completed

### 1. Removed credential-bearing development diagnostics

- Root cause: temporary database troubleshooting scripts were tracked and included hard-coded credentials or printed environment-derived connection data.
- Files changed: removed `backend/test-db.js`, `backend/test-direct-host.js`, `backend/test-direct-uri.js`, `backend/test-permissions.js`, `backend/tmp-mongo-direct-test.js`, `backend/tmp-mongo-native-test.js`, `backend/tmp-mongo-native-test2.js`, and `backend/tmp-mongo-test.js`.
- Fix applied: removed unused diagnostics from the handover repository.
- Test added: `backend/tests/secret-hygiene.test.js` scans application source for credential-bearing MongoDB URIs and direct Mongo credential logging.
- Verification: 2/2 new tests pass; full backend suite 97/97; backend lint passes.

No production deployment, database write, Cloudinary mutation, inquiry submission, or admin action was performed.

## K. Tests blocked

| Test | Required access/information |
| --- | --- |
| Full admin login, TOTP, email OTP, resend/expiry, recovery, logout/back behavior | Valid admin credentials, authenticator/recovery code, and access to the OTP mailbox |
| Add/edit/publish/feature/delete artwork | Admin access plus authorization to create clearly labelled temporary records |
| Single/bulk upload, pause/resume/stop/retry, duplicate, Cloudinary cleanup | Admin access plus approved disposable images/test records |
| Upload History and batch deletion/count | Admin access |
| Inquiry receipt, admin management, Netlify backup | Permission to submit labelled production test inquiries; Admin and Netlify Forms access |
| Profile/settings/Hero save/cancel persistence | Admin access and permission to mutate temporary/reversible settings |
| MongoDB authoritative count/index/orphan query | Atlas network/IP access or a read-only MongoDB account |
| Gmail delivery | Gmail service/mailbox access |
| Firefox testing | Firefox installation |
| Real-device/assistive technology pass | Physical devices and NVDA/VoiceOver/manual tester |

## L. Final handover checklist

- [ ] **Rotate the exposed MongoDB credential before any launch or repository sharing.**
- [ ] Review Atlas logs/users, revoke the old credential, update Render/local secrets, and verify backend health.
- [ ] Remove the secret from Git history or create a clean repository history before client handover.
- [ ] Deploy the current backend first, then the current Netlify frontend/function configuration.
- [ ] Seed and verify `/api/public-portfolio` returns 200, a valid ETag, and 304 on repeat validation.
- [ ] Re-run mobile Lighthouse; require a major LCP improvement from the current 7.0–8.7s.
- [ ] Complete one labelled admin end-to-end test: login → upload → edit/publish/feature → public visibility → delete → public removal.
- [ ] Submit one labelled Contact inquiry and one artwork enquiry; verify Admin Inquiries and Netlify Forms, then remove only those test records.
- [ ] Test TOTP, email OTP, resend/expiry, one recovery code, logout, refresh, and back-button behavior.
- [ ] Confirm the client accepts 725 Uncategorized works with sparse metadata, or complete categories/years/media/descriptions and feature selections.
- [ ] Fix the confirmed contrast/accessibility-name/heading/touch-target issues and run a manual keyboard/screen-reader check.
- [ ] Confirm maintenance mode remains off, all contact/social information is approved, and take MongoDB/Cloudinary backups.
