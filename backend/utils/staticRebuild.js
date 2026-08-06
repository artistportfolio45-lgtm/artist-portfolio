let pendingRebuildTimer = null;
let pendingRebuildReason = null;
let rebuildInFlight = null;

const getDebounceMs = () => {
  const configured = Number.parseInt(process.env.STATIC_REBUILD_DEBOUNCE_MS, 10);
  return Number.isFinite(configured) && configured > 0 ? configured : 30000;
};

const runStaticRebuild = async (reason) => {
  const hookUrl = process.env.NETLIFY_BUILD_HOOK_URL;
  if (!hookUrl) {
    return { triggered: false, message: "NETLIFY_BUILD_HOOK_URL is not configured" };
  }

  if (rebuildInFlight) return rebuildInFlight;
  rebuildInFlight = (async () => {
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
    } finally {
      rebuildInFlight = null;
    }
  })();
  return rebuildInFlight;
};

const triggerStaticRebuild = async (reason) => {
  if (!process.env.NETLIFY_BUILD_HOOK_URL) {
    return { triggered: false, message: "NETLIFY_BUILD_HOOK_URL is not configured" };
  }

  pendingRebuildReason = reason;
  if (pendingRebuildTimer) clearTimeout(pendingRebuildTimer);
  pendingRebuildTimer = setTimeout(() => {
    const finalReason = pendingRebuildReason;
    pendingRebuildTimer = null;
    pendingRebuildReason = null;
    flushStaticRebuild(finalReason).catch(() => {});
  }, getDebounceMs());
  pendingRebuildTimer.unref?.();
  return { triggered: true, scheduled: true };
};

const flushStaticRebuild = async (reason) => {
  if (pendingRebuildTimer) {
    clearTimeout(pendingRebuildTimer);
    pendingRebuildTimer = null;
  }
  const finalReason = reason || pendingRebuildReason || "public-data-refresh";
  pendingRebuildReason = null;
  if (rebuildInFlight) await rebuildInFlight;
  return runStaticRebuild(finalReason);
};

const resetStaticRebuildForTests = () => {
  if (pendingRebuildTimer) {
    clearTimeout(pendingRebuildTimer);
    pendingRebuildTimer = null;
  }
  pendingRebuildReason = null;
  rebuildInFlight = null;
};

module.exports = { triggerStaticRebuild, flushStaticRebuild, resetStaticRebuildForTests };
