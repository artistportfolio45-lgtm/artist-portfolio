(function bootstrapArtistPortfolioTheme() {
  "use strict";

  var CACHE_KEY = "artist-portfolio:theme:v1";
  var CACHE_VERSION = 1;
  var COLOR_FIELDS = [
    "primaryColor", "secondaryColor", "accentColor", "backgroundColor",
    "surfaceColor", "textColor", "mutedTextColor", "borderColor"
  ];
  var MODES = ["light", "dark", "contrast"];
  var PRESETS = ["gallery-light", "windows-light", "windows-dark", "high-contrast", "ocean", "forest", "rose", "graphite"];
  var DEFAULT_THEME = Object.freeze({
    themePreset: "windows-light",
    themeMode: "light",
    primaryColor: "#202020",
    secondaryColor: "#F3F3F3",
    accentColor: "#0067C0",
    backgroundColor: "#F3F3F3",
    surfaceColor: "#FFFFFF",
    textColor: "#1B1B1B",
    mutedTextColor: "#5E5E5E",
    borderColor: "#DADADA",
    buttonRadius: "24px",
    cardRadius: "2px"
  });

  function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function isHex(value) {
    return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
  }

  function isRadius(value) {
    if (typeof value !== "string" || !/^(?:0|[1-9]|1\d|2[0-4])px$/.test(value)) return false;
    var amount = Number.parseInt(value, 10);
    return Number.isInteger(amount) && amount >= 0 && amount <= 24;
  }

  function validate(settings) {
    if (!isPlainObject(settings)) return null;
    for (var index = 0; index < COLOR_FIELDS.length; index += 1) {
      if (!isHex(settings[COLOR_FIELDS[index]])) return null;
    }
    if (!isRadius(settings.buttonRadius) || !isRadius(settings.cardRadius)) return null;
    if (!MODES.includes(settings.themeMode) || !PRESETS.includes(settings.themePreset)) return null;

    var safe = {
      themePreset: settings.themePreset,
      themeMode: settings.themeMode,
      buttonRadius: settings.buttonRadius,
      cardRadius: settings.cardRadius
    };
    COLOR_FIELDS.forEach(function copyColor(field) { safe[field] = settings[field].toUpperCase(); });
    return safe;
  }

  function channels(hex) {
    return [1, 3, 5].map(function channel(start) { return Number.parseInt(hex.slice(start, start + 2), 16); });
  }

  function rgb(hex) {
    return channels(hex).join(" ");
  }

  function mix(hex, amount) {
    var target = amount > 0 ? 255 : 0;
    var ratio = Math.abs(amount);
    return "#" + channels(hex).map(function mixed(channel) {
      return Math.round(channel + (target - channel) * ratio).toString(16).padStart(2, "0");
    }).join("");
  }

  function luminance(hex) {
    var values = channels(hex).map(function linear(channel) {
      var value = channel / 255;
      return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2];
  }

  function contrast(first, second) {
    var lighter = Math.max(luminance(first), luminance(second));
    var darker = Math.min(luminance(first), luminance(second));
    return (lighter + 0.05) / (darker + 0.05);
  }

  function readableAccent(theme) {
    var backgrounds = [theme.backgroundColor, theme.surfaceColor, theme.secondaryColor];
    var passes = function passes(color) {
      return backgrounds.every(function enoughContrast(background) { return contrast(color, background) >= 4.5; });
    };
    if (passes(theme.accentColor)) return theme.accentColor;
    var average = backgrounds.reduce(function total(sum, color) { return sum + luminance(color); }, 0) / backgrounds.length;
    var direction = average > 0.45 ? -1 : 1;
    for (var step = 1; step <= 10; step += 1) {
      var candidate = mix(theme.accentColor, direction * step / 10);
      if (passes(candidate)) return candidate;
    }
    return direction < 0 ? "#1C1C1E" : "#FFFFFF";
  }

  function apply(settings) {
    var theme = validate(settings);
    if (!theme) return false;
    var root = document.documentElement;
    var accentLight = mix(theme.accentColor, 0.22);
    var accentDark = mix(theme.accentColor, -0.25);
    var foreground = contrast("#1C1C1E", theme.accentColor) >= contrast("#FFFFFF", theme.accentColor) ? "#1C1C1E" : "#FFFFFF";
    var variables = {
      "--theme-primary": theme.primaryColor,
      "--theme-secondary": theme.secondaryColor,
      "--theme-accent": theme.accentColor,
      "--theme-accent-light": accentLight,
      "--theme-accent-dark": accentDark,
      "--theme-accent-foreground": foreground,
      "--theme-accent-readable": readableAccent(theme),
      "--theme-bg": theme.backgroundColor,
      "--theme-surface": theme.surfaceColor,
      "--theme-text": theme.textColor,
      "--theme-muted": theme.mutedTextColor,
      "--theme-border": theme.borderColor,
      "--theme-primary-rgb": rgb(theme.primaryColor),
      "--theme-secondary-rgb": rgb(theme.secondaryColor),
      "--theme-accent-rgb": rgb(theme.accentColor),
      "--theme-accent-light-rgb": rgb(accentLight),
      "--theme-accent-dark-rgb": rgb(accentDark),
      "--theme-bg-rgb": rgb(theme.backgroundColor),
      "--theme-surface-rgb": rgb(theme.surfaceColor),
      "--theme-text-rgb": rgb(theme.textColor),
      "--theme-muted-rgb": rgb(theme.mutedTextColor),
      "--theme-border-rgb": rgb(theme.borderColor),
      "--theme-button-radius": theme.buttonRadius,
      "--theme-card-radius": theme.cardRadius
    };
    Object.keys(variables).forEach(function setVariable(name) { root.style.setProperty(name, variables[name]); });
    root.dataset.themeMode = theme.themeMode;
    root.dataset.themeReady = "true";
    return true;
  }

  function read() {
    try {
      var payload = JSON.parse(window.localStorage.getItem(CACHE_KEY) || "null");
      var theme = isPlainObject(payload) && payload.version === CACHE_VERSION ? validate(payload.theme) : null;
      if (!theme) {
        try { window.localStorage.removeItem(CACHE_KEY); } catch (_ignored) { /* storage unavailable */ }
      }
      return theme;
    } catch (_error) {
      try { window.localStorage.removeItem(CACHE_KEY); } catch (_ignored) { /* storage unavailable */ }
      return null;
    }
  }

  function cacheAndApply(settings) {
    var theme = validate(settings);
    if (!theme) return false;
    apply(theme);
    try {
      window.localStorage.setItem(CACHE_KEY, JSON.stringify({ version: CACHE_VERSION, theme: theme }));
    } catch (_error) { /* private mode or disabled storage: applied safely for this page */ }
    return true;
  }

  window.ArtistPortfolioTheme = Object.freeze({
    cacheKey: CACHE_KEY,
    defaults: DEFAULT_THEME,
    validate: validate,
    apply: apply,
    cacheAndApply: cacheAndApply,
    read: read
  });
  apply(read() || DEFAULT_THEME);
}());
