/**
 * VYBE OTT - Streams Normalizer & Hierarchy Engine
 * Strict ES5/ES2015 compatible.
 *
 * Core rule: Providers are NEVER mixed.
 * Hierarchy: Provider -> Language -> Quality -> (mirrors)
 */
(function(window) {
  'use strict';

  var Streams = {};
  var config = window.VYBE_CONFIG;
  var utils = window.VYBE_UTILS;

  // In-memory cache for streams: key = type:id:S:E -> { timestamp, rawStreams, normalized }
  var streamCache = {};
  // In-memory cache for negative results: key = type:id:S:E -> timestamp
  var negativeCache = {};

  /**
   * Parse language from stream name and provider
   */
  Streams.parseLanguage = function(providerKey, name) {
    if (!name) return 'Default';
    if (providerKey === 'castletv') {
      var match = name.match(/\[([^\]]+)\]/);
      if (match && match[1]) {
        var lang = match[1].trim();
        if (lang.toUpperCase() === 'OST') {
          return 'Original (OST)';
        }
        return lang;
      }
    }
    if (providerKey === 'netmirror') {
      return 'Original';
    }
    return 'Default';
  };

  /**
   * Parse quality label and numeric rank
   */
  Streams.parseQuality = function(qualityStr) {
    if (!qualityStr) {
      return { label: 'Auto', rank: 1 };
    }
    var q = String(qualityStr).trim();
    if (/4k/i.test(q)) {
      return { label: '2160p', rank: 2160 };
    }
    var match = q.match(/(\d{3,4})/);
    if (match && match[1]) {
      var num = parseInt(match[1], 10);
      return { label: num + 'p', rank: num };
    }
    if (/auto/i.test(q)) {
      return { label: 'Auto', rank: 1 };
    }
    return { label: q, rank: 1 };
  };

  /**
   * Parse subSource from title or name (e.g., "NetMirror | Netflix" -> "Netflix")
   */
  Streams.parseSubSource = function(name) {
    if (!name || name.indexOf('|') === -1) return '';
    var parts = name.split('|');
    if (parts.length > 1) {
      return parts[1].trim();
    }
    return '';
  };

  /**
   * Parse file size from title text (e.g. "3.85 GB")
   */
  Streams.parseSizeText = function(title) {
    if (!title) return '';
    var match = title.match(/(\d+(?:\.\d+)?\s?(?:GB|MB))/i);
    return match && match[1] ? match[1] : '';
  };

  /**
   * Normalize subtitles array
   */
  Streams.normalizeSubtitles = function(subtitles) {
    if (!subtitles || !subtitles.length) return [];
    var list = [];
    for (var i = 0; i < subtitles.length; i++) {
      var sub = subtitles[i];
      if (sub && sub.url) {
        var label = sub.label || Streams.mapLanguageCodeToLabel(sub.lang);
        list.push({
          url: sub.url,
          langCode: sub.lang || 'en',
          label: label,
          id: sub.id || ('sub_' + i)
        });
      }
    }

    // Sort: English first, Hindi second, then alphabetically
    list.sort(function(a, b) {
      var codeA = (a.langCode || '').toLowerCase();
      var codeB = (b.langCode || '').toLowerCase();
      if (codeA === 'en') return -1;
      if (codeB === 'en') return 1;
      if (codeA === 'hi') return -1;
      if (codeB === 'hi') return 1;
      return a.label.localeCompare(b.label);
    });

    return list;
  };

  /**
   * Language code to friendly label mapping
   */
  Streams.mapLanguageCodeToLabel = function(code) {
    if (!code) return 'Subtitle';
    var c = code.toLowerCase();
    var map = {
      'en': 'English',
      'hi': 'हिन्दी (Hindi)',
      'ta': 'தமிழ் (Tamil)',
      'te': 'తెలుగు (Telugu)',
      'ml': 'മലയാളം (Malayalam)',
      'kn': 'ಕನ್ನಡ (Kannada)',
      'mr': 'मराठी (Marathi)',
      'pa': 'ਪੰਜਾਬੀ (Punjabi)',
      'bn': 'বাংলা (Bengali)',
      'es': 'Spanish',
      'fr': 'French',
      'de': 'German',
      'it': 'Italian',
      'pt': 'Portuguese',
      'ru': 'Russian',
      'ar': 'Arabic',
      'ja': 'Japanese',
      'ko': 'Korean',
      'zh': 'Chinese',
      'id': 'Indonesian',
      'in_id': 'Indonesian',
      'th': 'Thai',
      'tr': 'Turkish',
      'vi': 'Vietnamese',
      'ur': 'Urdu'
    };
    return map[c] || code.toUpperCase();
  };

  /**
   * Normalize single raw stream
   */
  Streams.normalizeSingle = function(rawStream, forcedProviderKey) {
    var rawProv = forcedProviderKey || rawStream.provider || 'unknown';
    var providerKey = rawProv.toLowerCase().replace(/\s+/g, '');
    var providerName = rawStream.provider || providerKey.toUpperCase();

    var parsedLang = Streams.parseLanguage(providerKey, rawStream.name);
    var parsedQ = Streams.parseQuality(rawStream.quality);
    var subSource = Streams.parseSubSource(rawStream.name);
    var sizeText = Streams.parseSizeText(rawStream.title);
    var subtitles = Streams.normalizeSubtitles(rawStream.subtitles);

    return {
      providerKey: providerKey,
      providerName: providerName,
      subSource: subSource,
      language: parsedLang,
      qualityLabel: parsedQ.label,
      qualityRank: parsedQ.rank,
      url: rawStream.url,
      headers: rawStream.headers || {},
      subtitles: subtitles,
      sizeText: sizeText,
      mirrors: [],
      raw: rawStream
    };
  };

  /**
   * Group, dedupe, and collapse mirrors according to specification
   */
  Streams.groupAndNormalize = function(rawStreamList, forcedProviderKey) {
    if (!rawStreamList || !rawStreamList.length) {
      return { providers: [], byProvider: {} };
    }

    var dedupeMap = {};
    var byProvider = {};

    for (var i = 0; i < rawStreamList.length; i++) {
      var item = Streams.normalizeSingle(rawStreamList[i], forcedProviderKey);
      var key = item.providerKey + '|' + item.language + '|' + item.qualityRank + '|' + item.subSource;

      if (!dedupeMap[key]) {
        dedupeMap[key] = item;
        if (!byProvider[item.providerKey]) {
          byProvider[item.providerKey] = [];
        }
        byProvider[item.providerKey].push(item);
      } else {
        // Collapse mirror CDN URL into mirrors array
        dedupeMap[key].mirrors.push(item.url);
      }
    }

    // Sort streams within each provider: highest quality rank first
    var provKeys = Object.keys(byProvider);
    for (var p = 0; p < provKeys.length; p++) {
      byProvider[provKeys[p]].sort(function(a, b) {
        return b.qualityRank - a.qualityRank;
      });
    }

    // Sort providers by configuration preference order
    var sortedProviders = provKeys.sort(function(a, b) {
      var idxA = config.PROVIDER_ORDER.indexOf(a);
      var idxB = config.PROVIDER_ORDER.indexOf(b);
      if (idxA === -1) idxA = 999;
      if (idxB === -1) idxB = 999;
      if (idxA !== idxB) return idxA - idxB;
      return (byProvider[b] ? byProvider[b].length : 0) - (byProvider[a] ? byProvider[a].length : 0);
    });

    return {
      providers: sortedProviders,
      byProvider: byProvider
    };
  };

  /**
   * Get available languages for a specific provider
   */
  Streams.getLanguagesForProvider = function(streamsForProvider) {
    if (!streamsForProvider || !streamsForProvider.length) return [];
    var seen = {};
    var langs = [];
    for (var i = 0; i < streamsForProvider.length; i++) {
      var l = streamsForProvider[i].language;
      if (!seen[l]) {
        seen[l] = true;
        langs.push(l);
      }
    }
    return langs;
  };

  /**
   * Get available qualities for a specific provider and language
   */
  Streams.getQualitiesForLanguage = function(streamsForProvider, language) {
    if (!streamsForProvider || !streamsForProvider.length) return [];
    var seen = {};
    var qualities = [];
    for (var i = 0; i < streamsForProvider.length; i++) {
      var s = streamsForProvider[i];
      if (s.language === language) {
        var q = s.qualityLabel;
        if (!seen[q]) {
          seen[q] = true;
          qualities.push({
            label: q,
            rank: s.qualityRank,
            sizeText: s.sizeText,
            stream: s
          });
        }
      }
    }
    qualities.sort(function(a, b) {
      return b.rank - a.rank;
    });
    return qualities;
  };

  /**
   * Find specific stream matching provider, language, and quality
   */
  Streams.findStream = function(byProvider, providerKey, language, qualityRank) {
    var list = byProvider[providerKey];
    if (!list || !list.length) return null;

    // 1. Exact match
    for (var i = 0; i < list.length; i++) {
      if (list[i].language === language && list[i].qualityRank === qualityRank) {
        return list[i];
      }
    }

    // 2. Same language, closest quality
    var langMatches = [];
    for (var j = 0; j < list.length; j++) {
      if (list[j].language === language) {
        langMatches.push(list[j]);
      }
    }
    if (langMatches.length > 0) {
      langMatches.sort(function(a, b) {
        return Math.abs(a.qualityRank - qualityRank) - Math.abs(b.qualityRank - qualityRank);
      });
      return langMatches[0];
    }

    // 3. Fallback to first stream in provider
    return list[0];
  };

  /**
   * Auto-pick initial stream based on user settings:
   * Same provider preference -> preferred language -> highest quality <= preferred max
   */
  Streams.autoSelectInitialStream = function(groupedData) {
    if (!groupedData || !groupedData.providers || !groupedData.providers.length) {
      return null;
    }
    var userPref = utils.storage.get('vybe_settings', config.DEFAULTS);
    var preferredLang = (userPref && userPref.preferredLanguage) || 'Hindi';
    var preferredMaxQ = (userPref && userPref.preferredMaxQuality) || '1080p';
    var maxRank = parseInt(preferredMaxQ, 10) || 1080;

    var bestProvider = groupedData.providers[0];
    var streams = groupedData.byProvider[bestProvider] || [];
    if (!streams.length) return null;

    // Check if preferred language exists in best provider
    var matchingLang = streams[0].language;
    for (var i = 0; i < streams.length; i++) {
      if (streams[i].language.toLowerCase() === preferredLang.toLowerCase()) {
        matchingLang = streams[i].language;
        break;
      }
    }

    // Pick highest quality <= maxRank in this language
    var candidates = [];
    for (var j = 0; j < streams.length; j++) {
      if (streams[j].language === matchingLang) {
        candidates.push(streams[j]);
      }
    }
    candidates.sort(function(a, b) {
      return b.qualityRank - a.qualityRank;
    });

    for (var k = 0; k < candidates.length; k++) {
      if (candidates[k].qualityRank <= maxRank) {
        return candidates[k];
      }
    }

    return candidates[0] || streams[0];
  };

  /**
   * Cache management
   */
  Streams.makeCacheKey = function(mediaType, id, season, episode) {
    return mediaType + ':' + id + (season !== undefined ? (':' + season + ':' + episode) : '');
  };

  Streams.getCached = function(key) {
    var entry = streamCache[key];
    if (entry && (Date.now() - entry.timestamp < config.STREAM_CACHE_TTL_MS)) {
      return entry;
    }
    return null;
  };

  Streams.setCached = function(key, rawStreams, grouped) {
    streamCache[key] = {
      timestamp: Date.now(),
      rawStreams: rawStreams,
      grouped: grouped
    };
  };

  Streams.isMarkedNegative = function(key) {
    var timestamp = negativeCache[key];
    if (timestamp && (Date.now() - timestamp < config.NO_STREAMS_CACHE_TTL_MS)) {
      return true;
    }
    return false;
  };

  Streams.markNegative = function(key) {
    negativeCache[key] = Date.now();
  };

  Streams.clearNegative = function(key) {
    delete negativeCache[key];
  };

  window.VYBE_STREAMS = Streams;
})(window);
