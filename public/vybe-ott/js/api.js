/**
 * VYBE OTT - API Layer
 * Cloudflare Worker API client with timeout, error handling, and proxy generation.
 * Strict ES5/ES2015 Promises (no async/await).
 */
(function(window) {
  'use strict';

  var Api = {};
  var config = window.VYBE_CONFIG;
  var utils = window.VYBE_UTILS;

  // Timeout helper using Promise.race
  function timeoutPromise(ms) {
    return new Promise(function(resolve, reject) {
      setTimeout(function() {
        reject(new Error('REQUEST_TIMEOUT'));
      }, ms);
    });
  }

  // Base GET request with timeout
  Api.get = function(path, customTimeout) {
    var url = config.API_BASE_URL + path;
    utils.recordDebug('lastApiUrl', url);
    var timeoutMs = customTimeout || 15000;

    var fetchOp = window.fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    }).then(function(res) {
      if (!res.ok) {
        if (res.status === 503) {
          throw new Error('TMDB_KEY_REQUIRED');
        }
        throw new Error('HTTP_' + res.status);
      }
      return res.json();
    });

    return Promise.race([fetchOp, timeoutPromise(timeoutMs)]);
  };

  /**
   * Builds the stream playback URL according to Cost Control rules:
   * 1. If alwaysUseProxy is ON -> use proxy
   * 2. If headers contain Referer or Origin -> use proxy
   * 3. Else if provider has stored proxy preference -> use proxy
   * 4. Else use direct stream URL
   */
  Api.buildPlayUrl = function(stream, forceProxy) {
    if (!stream || !stream.url) return '';
    var userPref = utils.storage.get('vybe_settings', config.DEFAULTS);
    var providerKey = stream.providerKey || (stream.provider ? stream.provider.toLowerCase().replace(/\s+/g, '') : 'default');
    var providerProxyPref = utils.storage.get('vybe_proxy_pref_' + providerKey, false);

    var hasSpecialHeaders = false;
    if (stream.headers) {
      var headerKeys = Object.keys(stream.headers);
      for (var i = 0; i < headerKeys.length; i++) {
        var hk = headerKeys[i].toLowerCase();
        if (hk === 'referer' || hk === 'origin') {
          hasSpecialHeaders = true;
          break;
        }
      }
    }

    // Detect standard desktop/mobile browser preview (non-webOS TV)
    // Browsers running HLS.js require Access-Control-Allow-Origin headers which third-party CDNs omit.
    // The Worker proxy supplies CORS headers and rewrites playlist segment URLs.
    var isBrowser = typeof window !== 'undefined' &&
                    !window.webOS &&
                    !window.PalmSystem &&
                    (navigator.userAgent.indexOf('Web0S') === -1 && navigator.userAgent.indexOf('webOS') === -1);

    var needsProxy = forceProxy ||
      isBrowser ||
      (userPref && userPref.alwaysUseProxy) ||
      hasSpecialHeaders ||
      providerProxyPref;

    if (needsProxy) {
      var headersJson = JSON.stringify(stream.headers || {});
      var hB64 = utils.b64EncodeUnicode(headersJson);
      return config.API_BASE_URL + '/api/proxy?url=' + encodeURIComponent(stream.url) + '&h=' + encodeURIComponent(hB64);
    }

    return stream.url;
  };

  /**
   * Proxied subtitle fetcher with SRT to VTT translation
   */
  Api.fetchSubtitleTrack = function(subtitleObj) {
    if (!subtitleObj || !subtitleObj.url) {
      return Promise.reject(new Error('INVALID_SUBTITLE'));
    }

    // Always proxy subtitle to prevent TV CORS block
    var proxiedUrl = config.API_BASE_URL + '/api/proxy?url=' + encodeURIComponent(subtitleObj.url) + '&h=' + encodeURIComponent(utils.b64EncodeUnicode('{}'));
    return window.fetch(proxiedUrl)
      .then(function(res) {
        if (!res.ok) throw new Error('SUBTITLE_LOAD_FAILED');
        return res.text();
      })
      .then(function(text) {
        var isSrt = subtitleObj.url.indexOf('.srt') !== -1 || text.indexOf('-->') !== -1 && text.indexOf('WEBVTT') === -1;
        var vtt = isSrt ? utils.srtToWebVTT(text) : text;
        return utils.parseWebVTT(vtt);
      });
  };

  /**
   * Fetch streams for a single provider
   */
  Api.fetchProviderStreams = function(providerKey, mediaType, tmdbId, season, episode) {
    var path = '/api/streams/' + encodeURIComponent(providerKey) + '/' + (mediaType === 'tv' ? 'series' : 'movie') + '/' + tmdbId;
    if (mediaType === 'tv' && season !== undefined && episode !== undefined) {
      path += '?season=' + season + '&episode=' + episode;
    }

    var startTime = Date.now();
    return Api.get(path, config.PROVIDER_TIMEOUT_MS)
      .then(function(data) {
        var duration = Date.now() - startTime;
        utils.debugInfo.providerTimings[providerKey] = duration;
        if (data && data.success && data.streams && data.streams.length > 0) {
          return {
            providerKey: providerKey,
            streams: data.streams,
            timing: duration,
            count: data.streams.length
          };
        }
        return { providerKey: providerKey, streams: [], timing: duration, count: 0 };
      })
      .catch(function(err) {
        var duration2 = Date.now() - startTime;
        utils.debugInfo.providerTimings[providerKey] = 'fail (' + duration2 + 'ms)';
        utils.log('Provider ' + providerKey + ' fetch error:', err.message);
        // Soft fail per specification: treated as 0 streams
        return { providerKey: providerKey, streams: [], timing: duration2, count: 0, error: err.message };
      });
  };

  /**
   * Fetch all providers aggregated
   */
  Api.fetchAggregatedStreams = function(mediaType, tmdbId, season, episode) {
    var path = '/api/streams/' + (mediaType === 'tv' ? 'series' : 'movie') + '/' + tmdbId;
    if (mediaType === 'tv' && season !== undefined && episode !== undefined) {
      path += '?season=' + season + '&episode=' + episode;
    }
    return Api.get(path, 15000);
  };

  // Check backend health
  Api.checkHealth = function() {
    return Api.get('/api/health', 5000);
  };

  window.VYBE_API = Api;
})(window);
