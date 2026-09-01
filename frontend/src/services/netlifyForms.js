// Use a real static page that Netlify scans for these forms. Posting to `/` can
// be intercepted by the site's catch-all 404 redirect before Forms handles it.
const NETLIFY_FORMS_ENDPOINT = "/netlify-forms.html";

const encodeForm = (data) =>
  new URLSearchParams(
    Object.entries(data).filter(([, value]) => value !== undefined && value !== null)
  ).toString();

export const submitNetlifyForm = async (formName, data) => {
  const response = await fetch(NETLIFY_FORMS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: encodeForm({
      "form-name": formName,
      "bot-field": "",
      ...data,
    }),
  });

  if (!response.ok) {
    throw new Error(`Form submission failed: ${response.status}`);
  }
};

export { NETLIFY_FORMS_ENDPOINT };
