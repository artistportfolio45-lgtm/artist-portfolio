# Live Public Portfolio Architecture

## Request Flow

Public visitors call the Render API first.

```text
Visitor -> Netlify React app -> Render Express API -> MongoDB Atlas -> Cloudinary image URLs
```

If the live API is unavailable, the frontend falls back to the static JSON snapshot.

```text
Visitor -> Netlify React app -> /data/portfolio.json -> Cloudinary image URLs
```

The admin dashboard also uses the backend.

```text
Artist -> /admin -> Render Express API -> MongoDB Atlas -> Cloudinary
```

## Data Publishing Flow

1. The artist edits artwork, profile, logo, or settings in the admin dashboard.
2. The Express API saves the change in MongoDB or Cloudinary.
3. Public gallery refreshes fetch the latest API data with no-store cache busters.
4. No Netlify build hook runs for individual artwork create, update, image, or delete operations.
5. If a static JSON refresh is needed, an admin can trigger `POST /api/public-data/rebuild`, or use a scheduled/batched deployment process.
6. Netlify runs `npm run build`, which runs `scripts/generate-public-data.mjs`.
7. That script fetches `${VITE_API_URL}/public-data` and writes `public/data/portfolio.json`.
8. Vite builds and deploys the fallback snapshot.

Render cold starts can happen for public visitors because the live API is now the primary runtime data source.

## Folder Structure

```text
backend/
  routes/
    publicData.js          # JSON snapshot endpoint for Netlify builds
  utils/
    publicSnapshot.js      # Reads MongoDB and builds static public payload
    staticRebuild.js       # Optional Netlify build-hook trigger

frontend/
  public/
    data/portfolio.json    # Generated public portfolio snapshot
    _headers               # Cache rules
    _redirects             # SPA fallback
  scripts/
    generate-public-data.mjs
  src/
    services/
      api.js               # Admin/backend API client
      publicData.js        # Public live API client with static JSON fallback
      netlifyForms.js      # Public form submission to Netlify Forms
```

## Production Environment Variables

Netlify frontend:

```text
VITE_API_URL=https://your-render-service.onrender.com/api
PUBLIC_DATA_EXPORT_KEY=optional-shared-secret
```

Render backend:

```text
FRONTEND_URL=https://your-netlify-site.netlify.app
NETLIFY_BUILD_HOOK_URL=https://api.netlify.com/build_hooks/...
PUBLIC_DATA_EXPORT_KEY=same-optional-shared-secret
```

If `PUBLIC_DATA_EXPORT_KEY` is set on Render, Netlify must set the same value so the build can fetch the snapshot.

## Feature Change

Public contact and artwork inquiry forms now submit to Netlify Forms instead of `/api/inquiries`. This is intentional: saving inquiries through Express would reintroduce a Render dependency for visitors.

Best low-cost alternatives:

- Use Netlify Forms email notifications as the primary inbox.
- Add Zapier/Make/Netlify Function later to sync Netlify submissions into MongoDB.
- Keep the old admin inquiries screen for historical MongoDB inquiries or future admin-created records.
