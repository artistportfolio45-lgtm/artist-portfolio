// hooks/useSettings.js
// Fetch and cache website settings globally

import { useState, useEffect } from "react";
import { settingsAPI } from "../services/api";
import { publicDataAPI } from "../services/publicData";

// Simple module-level cache to avoid refetching on every mount
let cachedSettings = null;
let fetchPromise = null;
const SETTINGS_CHANGED_EVENT = "artist-portfolio:settings-changed";

const publishSettings = (newSettings) => {
  if (!newSettings) return;
  cachedSettings = newSettings;
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SETTINGS_CHANGED_EVENT, { detail: newSettings }));
  }
};

export const useSettings = () => {
  const [settings, setSettings] = useState(cachedSettings);
  const [loading, setLoading] = useState(!cachedSettings);

  useEffect(() => {
    let active = true;
    const handleSettingsChanged = (event) => {
      if (active) {
        setSettings(event.detail);
        setLoading(false);
      }
    };
    window.addEventListener(SETTINGS_CHANGED_EVENT, handleSettingsChanged);

    if (cachedSettings) {
      setSettings(cachedSettings);
      setLoading(false);
    }

    if (!fetchPromise) {
      const isAdminRoute = window.location.pathname.startsWith("/admin");
      fetchPromise = (isAdminRoute
        ? settingsAPI.get().then((res) => res.data.settings)
        : publicDataAPI.getSettings({ onLiveData: publishSettings })
      )
        .then((data) => {
          // A cached admin/live response is newer than the static snapshot
          // returned first by publicDataAPI, so never replace it with stale data.
          if (!cachedSettings) publishSettings(data);
          return cachedSettings;
        })
        .catch(() => null)
        .finally(() => { fetchPromise = null; });
    }

    fetchPromise.then((data) => {
      if (!active) return;
      setSettings(data);
      setLoading(false);
    });

    return () => {
      active = false;
      window.removeEventListener(SETTINGS_CHANGED_EVENT, handleSettingsChanged);
    };
  }, []);

  // Force a refresh (call after updating settings in admin)
  const refreshSettings = () => {
    cachedSettings = null;
    setLoading(true);
    settingsAPI.get().then((res) => {
      publishSettings(res.data.settings);
      setLoading(false);
    });
  };

  return { settings, loading, refreshSettings };
};

export const setCachedSettings = (newSettings) => {
  publishSettings(newSettings);
};
