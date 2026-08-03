let pendingRebuildTimer = null;
let pendingRebuildPromise = null;
let pendingRebuildReason = null;

const getDebounceMs = () => {
  const configured = Number.parseInt(process.env.STATIC_REBUILD_DEBOUNCE_MS, 10);
  return Number.isFinite(configured) && configured > 0 ? configured : 3000;
};

const triggerStaticRebuild = async (reason) => {
  const hookUrl = process.env.NETLIFY_BUILD_HOOK_URL;
  if (!hookUrl) {
    return { triggered: false, message: "NETLIFY_BUILD_HOOK_URL is not configured" };
  }

  if (!pendingRebuildPromise) {
    pendingRebuildPromise = new Promise((resolve) => {
      const runRebuild = async () => {
        try {
          const response = await fetch(hookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ trigger: pendingRebuildReason || reason }),
          });

          if (!response.ok) {
            console.error(`Netlify rebuild hook failed: ${response.status}`);
            resolve({ triggered: false, message: `Netlify rebuild hook failed: ${response.status}` });
            return;
          }

          resolve({ triggered: true });
        } catch (error) {
          console.error("Netlify rebuild hook error:", error.message);
          resolve({ triggered: false, message: error.message });
        } finally {
          pendingRebuildTimer = null;
          pendingRebuildPromise = null;
          pendingRebuildReason = null;
        }
      };

      pendingRebuildTimer = setTimeout(runRebuild, getDebounceMs());
    });
  }

  pendingRebuildReason = reason;
  return pendingRebuildPromise;
};

module.exports = { triggerStaticRebuild };
