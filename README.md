# Artist Portfolio

Full-stack artist portfolio and artwork showcase application.

The project has two apps:

- `frontend` - React + Vite public website and admin dashboard
- `backend` - Node.js + Express API with MongoDB, JWT auth, and Cloudinary uploads

Place this `README.md` at the project root, beside `frontend` and `backend`.

## Features

- Public home page, gallery, artwork details, about page, and contact page
- Admin login with JWT authentication
- Failed login tracking and temporary account lockout
- Google Authenticator compatible two-factor authentication
- Backup recovery codes for admin login
- Admin dashboard layout
- Create, edit, delete artworks
- Upload multiple artwork images to Cloudinary
- Featured artworks
- Availability status: available or sold
- Artist profile management
- Website settings and logo upload
- Admin-controlled website themes with preset palettes and custom colors
- SEO metadata, theme colors, and maintenance mode settings
- Inquiry/contact form
- Live public portfolio data from a site-wide Netlify Blob, with Render only as a controlled fallback
- Netlify Forms support for public contact and artwork inquiries
- Admin activity logs
- MongoDB Atlas database support

## Tech Stack

Frontend:

- React 18
- Vite
- React Router
- Axios
- React Hot Toast
- Tailwind CSS

Backend:

- Node.js
- Express
- MongoDB Atlas
- Mongoose
- JWT
- bcryptjs
- speakeasy
- qrcode
- Gmail API (OAuth 2.0 over HTTPS)
- Cloudinary
- Multer
- multer-storage-cloudinary

## Recommended Versions

Use a stable Node.js LTS version if possible.

Recommended:

```bash
node -v
# Node 20 LTS or Node 22 LTS recommended
```

The project has also been tested during development with Node `v24.16.0`, but production deployments are usually safer on LTS.

## Project Structure

```text
artist-portfolio/
  README.md
  backend/
    config/
    middleware/
    models/
    routes/
    .env.example
    package.json
    server.js
    seed-admin.js
    utils/
  frontend/
    public/
      data/
    src/
    scripts/
    .env.example
    package.json
```

## Backend Setup

Open a terminal in the project root:

```bash
cd backend
npm install
```

Create `backend/.env` from `backend/.env.example`:

```env
# Server
PORT=5000
NODE_ENV=development

# MongoDB Atlas
MONGO_URI=mongodb+srv://<username>:<password>@<cluster-url>/artist-portfolio?retryWrites=true&w=majority

# JWT
JWT_SECRET=replace_with_a_long_random_secret
JWT_EXPIRES_IN=7d

# TOTP secret encryption
TOTP_ENCRYPTION_KEY=replace_with_another_long_random_secret

# Gmail API email verification (backend-only; never put these in frontend variables)
GMAIL_CLIENT_ID=your_google_oauth_client_id
GMAIL_CLIENT_SECRET=your_google_oauth_client_secret
GMAIL_REFRESH_TOKEN=your_google_oauth_refresh_token
GMAIL_SENDER=artistportfolio45@gmail.com

# Account lockout
MAX_FAILED_LOGIN_ATTEMPTS=5
ACCOUNT_LOCK_MINUTES=15

# Rate limiting (window values are in milliseconds)
LOGIN_RATE_LIMIT_WINDOW=900000
LOGIN_RATE_LIMIT_MAX=5
OTP_SEND_RATE_LIMIT_WINDOW=900000
OTP_SEND_RATE_LIMIT_MAX=5
OTP_VERIFY_RATE_LIMIT_WINDOW=900000
OTP_VERIFY_RATE_LIMIT_MAX=10
TOTP_VERIFY_RATE_LIMIT_WINDOW=900000
TOTP_VERIFY_RATE_LIMIT_MAX=10
GENERAL_RATE_LIMIT_WINDOW=900000
GENERAL_RATE_LIMIT_MAX=100
UPLOAD_RATE_LIMIT_WINDOW=3600000
UPLOAD_RATE_LIMIT_MAX=50

# Cloudinary
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# Admin Seed Credentials, used only when creating first admin
ADMIN_EMAIL=your_admin_email
ADMIN_PASSWORD=your_strong_initial_password

# Frontend URL for CORS
FRONTEND_URL=http://localhost:5173

# Backend URL for security headers in deployed environments
BACKEND_URL=http://localhost:5000

# Runtime public-data synchronization (backend-only)
PUBLIC_DATA_SYNC_URL=https://your-netlify-site.netlify.app/.netlify/functions/sync-public-portfolio
PUBLIC_DATA_SYNC_SECRET=replace_with_the_same_random_32_plus_character_secret_used_on_netlify

# Optional, explicit SEO-only rebuild hook
NETLIFY_BUILD_HOOK_URL=
```

Start the backend:

```bash
npm run dev
```

Expected output:

```text
MongoDB connected: ...
Server running on port 5000 in development mode
```

Health check:

```bash
http://localhost:5000/api/health
```

Expected response:

```json
{
  "success": true,
  "message": "Artist Portfolio API is running",
  "env": "development"
}
```

## Frontend Setup

Open another terminal in the project root:

```bash
cd frontend
npm install
```

Create `frontend/.env` from `frontend/.env.example`:

```env
VITE_API_URL=http://localhost:5000/api

# Optional override for static public data generation
PUBLIC_DATA_API_URL=http://localhost:5000/api
```

Start the frontend:

```bash
npm run dev
```

Default local URL:

```text
http://localhost:5173
```

Admin login page:

```text
http://localhost:5173/admin/login
```

## MongoDB Atlas Setup

1. Create a MongoDB Atlas account.
2. Create a new project and cluster.
3. Create a database user in **Database Access**.
4. Give the user read/write permission for the application database.
5. Go to **Network Access**.
6. Add the developer/server IP address.
7. Copy the connection string.
8. Put the connection string in `backend/.env` as `MONGO_URI`.

Database name used by this project:

```text
artist-portfolio
```

Important:

- If the MongoDB password has special characters, URL-encode it.
- Example: `@` becomes `%40`.
- If the backend says the IP is not whitelisted, add the current IP in Atlas **Network Access**.

## Cloudinary Setup

Cloudinary is required for image upload.

1. Create a Cloudinary account.
2. Open Cloudinary dashboard.
3. Copy:
   - Cloud name
   - API key
   - API secret
4. Add them to `backend/.env`.

Uploaded images are stored in these folders:

```text
artist-portfolio/artworks
artist-portfolio/profile
artist-portfolio/settings
```

## Create the Admin User

The project has a seed route and a seed script.

### Option 1: Use Seed API Route

Make sure backend is running, then send a POST request:

```bash
POST http://localhost:5000/api/auth/seed
```

In PowerShell:

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:5000/api/auth/seed
```

This creates the admin from:

```env
ADMIN_EMAIL=...
ADMIN_PASSWORD=...
```

### Option 2: Use Seed Script

From `backend`:

```bash
node seed-admin.js
```

Important:

- The admin seed works only if no admin user already exists.
- `ADMIN_EMAIL` and `ADMIN_PASSWORD` must be configured before seeding.
- The seed password and future admin passwords must be at least 8 characters.
- If an admin already exists, changing `ADMIN_PASSWORD` in `.env` will not change the saved password.
- To change an existing password, log into admin and use the change password feature, or update/reset the user in MongoDB carefully.

## Admin Login

After seeding:

```text
Frontend: http://localhost:5173/admin/login
```

Use the email and password from:

```env
ADMIN_EMAIL=...
ADMIN_PASSWORD=...
```

Every successful password login requires a code sent through the Gmail API over HTTPS:

```text
Email + password -> email code -> dashboard
```

If Authenticator is enabled, login becomes:

```text
Email + password -> Authenticator code -> email code -> dashboard
```

The backend issues only a short-lived, login-scoped challenge token between these steps. It issues the final JWT after all required verification succeeds.

### Gmail API setup for admin verification emails

Render Free blocks SMTP ports, so this project sends verification emails through the Gmail API using OAuth 2.0 over HTTPS. The refresh token and client secret stay on the backend only. Configure the Gmail account `artistportfolio45@gmail.com` as follows:

1. In [Google Cloud Console](https://console.cloud.google.com/), create or select a project and enable **Gmail API** under **APIs & Services → Library**.
2. Under **APIs & Services → OAuth consent screen**, configure the consent screen. Add `artistportfolio45@gmail.com` as a test user while the app is in testing, or publish the app when appropriate.
3. Under **Credentials**, create an **OAuth client ID** of type **Web application**. Add this authorized redirect URI exactly: `https://developers.google.com/oauthplayground`.
4. Open [OAuth 2.0 Playground](https://developers.google.com/oauthplayground), click the settings icon, enable **Use your own OAuth credentials**, and enter the client ID and client secret from step 3.
5. In step 1 of the playground, authorize the scope `https://www.googleapis.com/auth/gmail.send` while signed in as `artistportfolio45@gmail.com`.
6. Exchange the authorization code for tokens, then copy the **refresh token**. Store it only in the backend host's environment settings.
7. Set the four `GMAIL_*` values below on Render and restart the backend. Do not use `VITE_` prefixes and do not add these values to the frontend.

```env
GMAIL_CLIENT_ID=your_google_oauth_client_id
GMAIL_CLIENT_SECRET=your_google_oauth_client_secret
GMAIL_REFRESH_TOKEN=your_google_oauth_refresh_token
GMAIL_SENDER=artistportfolio45@gmail.com
```

The backend validates these variables at startup. A Gmail API error or timeout is aborted promptly and returns `503` from the login or resend endpoint; the pending OTP and challenge are invalidated as before.

## Security Center and Two-Factor Authentication

Open the admin Security Center:

```text
http://localhost:5173/admin/security
```

From there the admin can:

- Enable two-factor authentication with Google Authenticator, Microsoft Authenticator, Authy, 2FAS, or Bitwarden Authenticator
- Scan a QR code or enter the manual setup key
- Receive one-time backup recovery codes
- Regenerate recovery codes
- Disable two-factor authentication after password and code verification

Security notes:

- TOTP secrets are encrypted before being stored in MongoDB.
- Authenticator enrollment is available only here after an authenticated admin confirms their password.
- QR codes and manual setup keys are returned only during an active Security Center enrollment.
- Recovery codes are hashed before being stored.
- Recovery codes are displayed only when generated.
- Set a strong `TOTP_ENCRYPTION_KEY` in production. If omitted, the backend falls back to `JWT_SECRET`, but a separate key is recommended.

## Artwork Upload Notes

Artwork creation requires at least one image.

The frontend sends images as `FormData` using the field name:

```text
images
```

The backend receives them here:

```text
POST /api/artworks
POST /api/artworks/:id/images
```

Images are uploaded to Cloudinary and saved in MongoDB as:

```js
images: [
  {
    url: "https://...",
    publicId: "artist-portfolio/artworks/..."
  }
]
```

If artwork text saves but images do not show, check:

- Backend server console for Cloudinary upload errors
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- Browser Network tab for `/api/artworks`
- MongoDB document: `images` should not be an empty array

## Common Local Development Commands

Backend:

```bash
cd backend
npm install
npm run dev
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Frontend production build:

```bash
cd frontend
npm run build
```

The frontend build runs `scripts/generate-public-data.mjs` before Vite. If `PUBLIC_DATA_API_URL` or `VITE_API_URL` is configured, the script fetches the latest static portfolio snapshot from `/api/public-data` and writes `frontend/public/data/portfolio.json`. If neither API URL is configured, it keeps the existing snapshot.

Preview frontend build:

```bash
cd frontend
npm run preview
```

Start backend in production mode:

```bash
cd backend
npm start
```

## API Routes

Auth:

```text
POST /api/auth/login
POST /api/auth/verify-totp
POST /api/auth/verify-email-otp
POST /api/auth/resend-email-otp
POST /api/auth/seed
GET  /api/auth/me
PUT  /api/auth/change-password
```

Security:

```text
GET  /api/security/status
POST /api/security/2fa/setup
POST /api/security/2fa/enable
POST /api/security/2fa/disable
POST /api/security/recovery-codes/regenerate
```

Auth responses now include the standard API envelope:

```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "token": "...",
    "user": {}
  }
}
```

For backwards compatibility, login still also returns `token` and `user` at the top level.

Artworks:

```text
GET    /api/artworks
GET    /api/artworks/categories
GET    /api/artworks/:id
POST   /api/artworks
PUT    /api/artworks/:id
POST   /api/artworks/:id/images
DELETE /api/artworks/:id/images/:publicId
DELETE /api/artworks/:id
```

Profile:

```text
GET /api/profile
PUT /api/profile
PUT /api/profile/photo
```

Settings:

```text
GET /api/settings
PUT /api/settings
PUT /api/settings/logo
```

Theme settings are stored with the global settings document. Admin can choose a preset theme, then customize primary, secondary, accent, background, surface, text, muted text, border, button radius, card radius, and light/dark/contrast mode values.

Activity:

```text
GET /api/activity
```

Public data:

```text
GET /api/public-data
POST /api/public-data/sync
POST /api/public-data/rebuild-seo
```

`GET /api/public-data` is the sanitized Render fallback. The protected sync endpoint regenerates and writes the current Netlify Blob snapshot. The protected SEO endpoint requires the body confirmation `REGENERATE_SEO` and is the only content-related route allowed to trigger `NETLIFY_BUILD_HOOK_URL`.

Inquiries:

```text
POST   /api/inquiries
GET    /api/inquiries
GET    /api/inquiries/:id
PATCH  /api/inquiries/:id/read
DELETE /api/inquiries/:id
```

Public contact and artwork inquiry forms submit through Netlify Forms. The `/api/inquiries` routes still exist for stored MongoDB inquiries and admin/history workflows.

## Public Site Data Flow

Public visitors load one complete portfolio snapshot from the same-origin Netlify Function:

```text
GET /api/public-portfolio
```

The Function reads `portfolio-public-data/current` with strong consistency and supports ETag revalidation. Search, filters, pagination, settings, profile, About, and artwork details use the shared in-memory snapshot. If Blob access is unavailable, the frontend makes one controlled request to Render:

```text
GET /api/public-data
```

The generated `frontend/public/data/portfolio.json` remains build-time SEO input only and is never the runtime Gallery source. Normal content changes synchronize the Blob and do not trigger a Netlify deployment.

See `STATIC_PUBLIC_ARCHITECTURE.md` for the fuller deployment notes.

## Production Deployment

The next developer can deploy frontend and backend separately.

Common setup:

- Frontend on Vercel, Netlify, or static hosting
- Backend on Render, Railway, VPS, EC2, DigitalOcean, or similar
- MongoDB Atlas for database
- Cloudinary for images
- Custom domain pointed to frontend
- Optional API subdomain pointed to backend, such as `api.example.com`

### Backend Production Environment

Set these environment variables on the backend host:

```env
PORT=5000
NODE_ENV=production
MONGO_URI=your_production_mongodb_uri
JWT_SECRET=your_long_random_secret
JWT_EXPIRES_IN=7d
TOTP_ENCRYPTION_KEY=your_separate_long_random_totp_encryption_secret
GMAIL_CLIENT_ID=your_google_oauth_client_id
GMAIL_CLIENT_SECRET=your_google_oauth_client_secret
GMAIL_REFRESH_TOKEN=your_google_oauth_refresh_token
GMAIL_SENDER=artistportfolio45@gmail.com
MAX_FAILED_LOGIN_ATTEMPTS=5
ACCOUNT_LOCK_MINUTES=15
LOGIN_RATE_LIMIT_WINDOW=900000
LOGIN_RATE_LIMIT_MAX=5
OTP_SEND_RATE_LIMIT_WINDOW=900000
OTP_SEND_RATE_LIMIT_MAX=5
OTP_VERIFY_RATE_LIMIT_WINDOW=900000
OTP_VERIFY_RATE_LIMIT_MAX=10
TOTP_VERIFY_RATE_LIMIT_WINDOW=900000
TOTP_VERIFY_RATE_LIMIT_MAX=10
GENERAL_RATE_LIMIT_WINDOW=900000
GENERAL_RATE_LIMIT_MAX=100
UPLOAD_RATE_LIMIT_WINDOW=3600000
UPLOAD_RATE_LIMIT_MAX=50
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
ADMIN_EMAIL=your_admin_email
ADMIN_PASSWORD=strong_initial_password
FRONTEND_URL=https://yourdomain.com
BACKEND_URL=https://api.yourdomain.com
NETLIFY_BUILD_HOOK_URL=https://api.netlify.com/build_hooks/...
PUBLIC_DATA_SYNC_URL=https://your-netlify-site.netlify.app/.netlify/functions/sync-public-portfolio
PUBLIC_DATA_SYNC_SECRET=the_same_random_32_plus_character_secret_used_on_netlify
```

Backend start command:

```bash
npm start
```

### Frontend and Netlify Function Production Environment

Set this build variable on the frontend host:

```env
VITE_API_URL=https://api.yourdomain.com/api
```

Set this separately for the Netlify Function runtime:

```env
PUBLIC_DATA_SYNC_SECRET=configure_in_netlify_function_runtime_only_not_as_a_vite_variable
```

Do not prefix `PUBLIC_DATA_SYNC_SECRET` with `VITE_`; it must never enter the browser bundle. See `STATIC_PUBLIC_ARCHITECTURE.md` for the initial seed and verification procedure.

Build command:

```bash
npm run build
```

Build output directory:

```text
dist
```

### CORS

The backend uses:

```env
FRONTEND_URL=https://yourdomain.com
```

This must exactly match the deployed frontend origin.

Examples:

```text
https://yourdomain.com
https://www.yourdomain.com
```

If frontend is deployed at `https://www.yourdomain.com`, set `FRONTEND_URL` to that exact value.

## Domain Setup

Recommended:

```text
yourdomain.com        -> frontend
www.yourdomain.com    -> frontend
api.yourdomain.com    -> backend
```

Then set:

Frontend:

```env
VITE_API_URL=https://api.yourdomain.com/api
```

Backend:

```env
FRONTEND_URL=https://yourdomain.com
```

If using `www`, make the backend CORS value match `https://www.yourdomain.com`.

## Security Checklist Before Handover or Deployment

- Do not commit real `.env` files to Git.
- Rotate any credentials that were shared during development.
- Use a strong `JWT_SECRET`.
- Use a separate strong `TOTP_ENCRYPTION_KEY`.
- Use a strong admin password.
- Enable two-factor authentication from the Security Center.
- Store recovery codes somewhere private.
- Keep account lockout enabled with `MAX_FAILED_LOGIN_ATTEMPTS` and `ACCOUNT_LOCK_MINUTES`.
- Keep MongoDB Atlas Network Access restricted to required IPs where possible.
- Do not leave test scripts with real credentials in production.
- Use HTTPS in production.
- Make sure Cloudinary API secret is stored only on backend host.
- Make sure `VITE_API_URL` does not point to localhost in production.

## Troubleshooting

### Admin Login Says "Unable to reach the server"

The frontend cannot reach the backend.

Check:

```bash
cd backend
npm run dev
```

Then open:

```text
http://localhost:5000/api/health
```

If backend is not running, login cannot work.

### MongoDB IP Not Whitelisted

Backend may show:

```text
Could not connect to any servers in your MongoDB Atlas cluster.
One common reason is that your IP isn't whitelisted.
```

Fix:

1. Go to MongoDB Atlas.
2. Open **Network Access**.
3. Add current IP address.
4. Wait 1-2 minutes.
5. Restart backend.

### Invalid Credentials

Possible causes:

- Admin user does not exist in MongoDB.
- Wrong email.
- Password in `.env` was changed after admin was already created.

Fix:

- Check MongoDB `users` collection.
- Seed admin if no admin exists.
- Reset password if admin already exists.

### Artwork Saves But Image Is Missing

Check MongoDB artwork document:

```js
images: []
```

If `images` is empty, the image did not upload.

Check:

- Cloudinary env values
- Backend console errors
- File selected in frontend form
- Request field name must be `images`
- Backend must be restarted after code/env changes

### Cloudinary `uploader` Undefined Error

If backend crashes with:

```text
Cannot read properties of undefined (reading 'uploader')
```

This is a Cloudinary storage adapter mismatch. The current code in `backend/config/cloudinary.js` handles the installed `multer-storage-cloudinary` version by passing the root Cloudinary module to the storage adapter.

Make sure latest project files are used and reinstall dependencies:

```bash
cd backend
npm install
npm run dev
```

### CORS Error in Browser

If browser console shows a CORS error:

- Check backend `FRONTEND_URL`.
- It must match frontend URL exactly.
- Restart backend after changing `.env`.

### PowerShell Blocks `npm`

If PowerShell says script execution is disabled, use:

```powershell
npm.cmd run dev
npm.cmd run build
```

## Handover Notes

Before giving this project to another developer:

1. Include `frontend`, `backend`, and this `README.md`.
2. Include `.env.example` files.
3. Do not include real `.env` files unless intentionally sharing credentials.
4. Ask the developer to create their own MongoDB Atlas database.
5. Ask the developer to create their own Cloudinary account.
6. Ask the developer to update production environment variables.
7. Ask the developer to seed the admin user after backend deployment.

Recommended first run for the new developer:

```bash
cd backend
npm install
npm run dev
```

In another terminal:

```bash
cd frontend
npm install
npm run dev
```

Then:

```text
http://localhost:5173
http://localhost:5173/admin/login
```

## Final Deployment Checklist

- Backend deploy works
- `/api/health` returns success
- MongoDB Atlas is connected
- Cloudinary upload works
- Frontend deploy works
- `VITE_API_URL` points to deployed backend
- `FRONTEND_URL` points to deployed frontend
- `BACKEND_URL` points to deployed backend
- Static public data build/export works
- Netlify build hook is configured if public pages should auto-refresh after admin edits
- Admin user is seeded
- Admin login works
- Artwork upload works
- Public gallery shows uploaded artwork images
- Contact and artwork inquiry forms submit through Netlify Forms
- Domain and HTTPS are active
