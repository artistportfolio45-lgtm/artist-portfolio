# Prompt 1 Addendum: Netlify Form Preservation

Add this section under `CRITICAL PRESERVATION RULES` before running Prompt 1.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NETLIFY FORM PRESERVATION (NON-NEGOTIABLE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The Contact Form and Artwork Inquiry Form are now fully functional.

DO NOT modify unless a proven bug exists.

Preserve:

• Netlify Forms configuration
• Hidden static forms
• form-name values
• data-netlify attributes
• Honeypot field
• Existing fetch() submission logic
• URL-encoded body format
• Hidden artwork context fields
• Contact submission behavior
• Artwork inquiry submission behavior
• Success messages
• Error messages
• Duplicate-submission prevention

Do NOT rename:

contact
artwork-inquiry

Do NOT remove:

frontend/index.html hidden forms

Do NOT remove:

frontend/public/netlify-forms.html

if present.

After all UI changes:

Run:

```powershell
cd frontend
npm.cmd run build
```

Verify:

• Contact form still submits successfully.
• Artwork inquiry still submits successfully.
• Netlify Forms still receive submissions.
• No POST / 404 errors.
• Production build passes.
