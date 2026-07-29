const triggerStaticRebuild = async (reason) => {
  const hookUrl = process.env.NETLIFY_BUILD_HOOK_URL;
  if (!hookUrl) {
    return { triggered: false, message: "NETLIFY_BUILD_HOOK_URL is not configured" };
  }

  try {
    const response = await fetch(hookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trigger: reason }),
    });

    if (!response.ok) {
      console.error(`Netlify rebuild hook failed: ${response.status}`);
      return { triggered: false, message: `Netlify rebuild hook failed: ${response.status}` };
    }

    return { triggered: true };
  } catch (error) {
    console.error("Netlify rebuild hook error:", error.message);
    return { triggered: false, message: error.message };
  }
};

module.exports = { triggerStaticRebuild };
