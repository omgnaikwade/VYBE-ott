/**
 * VYBE OTT - Configuration
 *
 * NOTE: Set API_BASE_URL to your deployed Cloudflare Worker URL (no trailing slash).
 * Example: "https://vybe-api.yourname.workers.dev"
 *
 * This is the ONLY file that holds the Worker URL. All requests pass through it.
 */
var VYBE_CONFIG = {
  // PASTE YOUR WORKER URL HERE:
  API_BASE_URL: "https://myapp-working.vyoma-apps.workers.dev",

  // Fallback to sample catalog if Worker URL is unchanged/unreachable during testing
  USE_DEMO_FALLBACK_IF_OFFLINE: false,

  // Provider preference hierarchy (used for auto-selecting best stream)
  PROVIDER_ORDER: [
    "castletv",
    "netmirror",
    "vidlink",
    "vaplayer",
    "streamflix",
    "onetouchtv",
    "hdghartv",
    "vixsrc",
    "zxcstreams"
  ],

  // All known provider keys for parallel requests
  ALL_PROVIDERS: [
    { key: "castletv", name: "CastleTV" },
    { key: "netmirror", name: "NetMirror" },
    { key: "vidlink", name: "Vidlink" },
    { key: "vaplayer", name: "VaPlayer" },
    { key: "streamflix", name: "StreamFlix" },
    { key: "onetouchtv", name: "OneTouchTV" },
    { key: "hdghartv", name: "HDGharTV" },
    { key: "vixsrc", name: "VixSrc" },
    { key: "zxcstreams", name: "ZXCStreams" }
  ],

  // TMDB Image CDN base
  TMDB_IMAGE_BASE: "https://image.tmdb.org/t/p/",

  // Default user settings
  DEFAULTS: {
    preferredLanguage: "Hindi",
    preferredMaxQuality: "1080p",
    defaultSubtitle: "Off",
    alwaysUseProxy: false,
    tmdbLanguage: "en-US"
  },

  // Stream cache TTL in milliseconds (15 minutes)
  STREAM_CACHE_TTL_MS: 15 * 60 * 1000,
  // Negative stream cache TTL (10 minutes)
  NO_STREAMS_CACHE_TTL_MS: 10 * 60 * 1000,
  // Provider request timeout (12 seconds)
  PROVIDER_TIMEOUT_MS: 12000,

  // Debug logging & debug overlay ('0' pressed 5 times)
  DEBUG: true,
  APP_VERSION: "1.0.0"
};

// Global export for vanilla scripts
window.VYBE_CONFIG = VYBE_CONFIG;
