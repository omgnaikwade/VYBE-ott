/**
 * VYBE OTT - Utility Functions
 * Strict ES5/ES2015 compatible for webOS 4.0 (Chromium 53).
 */
(function(window) {
  'use strict';

  var Utils = {};

  // Unicode-safe base64 encoding (required by Worker proxy)
  Utils.b64EncodeUnicode = function(str) {
    try {
      return window.btoa(unescape(encodeURIComponent(str)));
    } catch (e) {
      Utils.log('b64EncodeUnicode error:', e);
      return '';
    }
  };

  // Unicode-safe base64 decoding
  Utils.b64DecodeUnicode = function(str) {
    try {
      return decodeURIComponent(escape(window.atob(str)));
    } catch (e) {
      Utils.log('b64DecodeUnicode error:', e);
      return '';
    }
  };

  // String pad start helper (Chromium 53 polyfill)
  Utils.padZero = function(num, targetLength) {
    var str = String(num);
    var len = targetLength || 2;
    while (str.length < len) {
      str = '0' + str;
    }
    return str;
  };

  // Format seconds to mm:ss or hh:mm:ss
  Utils.formatTime = function(seconds) {
    if (isNaN(seconds) || seconds === null || seconds === undefined || seconds < 0) {
      return '00:00';
    }
    var totalSec = Math.floor(seconds);
    var hours = Math.floor(totalSec / 3600);
    var mins = Math.floor((totalSec % 3600) / 60);
    var secs = totalSec % 60;

    if (hours > 0) {
      return Utils.padZero(hours, 2) + ':' + Utils.padZero(mins, 2) + ':' + Utils.padZero(secs, 2);
    }
    return Utils.padZero(mins, 2) + ':' + Utils.padZero(secs, 2);
  };

  // Debounce function
  Utils.debounce = function(func, wait) {
    var timeout;
    return function() {
      var context = this;
      var args = arguments;
      clearTimeout(timeout);
      timeout = setTimeout(function() {
        func.apply(context, args);
      }, wait);
    };
  };

  // Safe localStorage wrapper
  Utils.storage = {
    get: function(key, defaultValue) {
      try {
        var item = window.localStorage.getItem(key);
        if (item === null || item === undefined) {
          return defaultValue !== undefined ? defaultValue : null;
        }
        return JSON.parse(item);
      } catch (e) {
        Utils.log('localStorage get error for key ' + key, e);
        return defaultValue !== undefined ? defaultValue : null;
      }
    },
    set: function(key, value) {
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (e) {
        Utils.log('localStorage set error for key ' + key, e);
        return false;
      }
    },
    remove: function(key) {
      try {
        window.localStorage.removeItem(key);
        return true;
      } catch (e) {
        Utils.log('localStorage remove error for key ' + key, e);
        return false;
      }
    }
  };

  // Debug logger
  Utils.log = function() {
    if (window.VYBE_CONFIG && window.VYBE_CONFIG.DEBUG && window.console && window.console.log) {
      var args = Array.prototype.slice.call(arguments);
      args.unshift('[VYBE]');
      window.console.log.apply(window.console, args);
    }
  };

  // Debug overlay message history
  Utils.debugInfo = {
    lastApiUrl: '-',
    lastStream: '-',
    providerTimings: {},
    logs: []
  };

  Utils.recordDebug = function(key, value) {
    Utils.debugInfo[key] = value;
    var overlay = document.getElementById('vybe-debug-overlay');
    if (overlay && overlay.style.display !== 'none') {
      Utils.updateDebugOverlay();
    }
  };

  Utils.updateDebugOverlay = function() {
    var el = document.getElementById('vybe-debug-content');
    if (!el) return;
    var html = '<div><b>Worker URL:</b> ' + (window.VYBE_CONFIG ? window.VYBE_CONFIG.API_BASE_URL : '-') + '</div>' +
      '<div><b>Last API:</b> ' + Utils.debugInfo.lastApiUrl + '</div>' +
      '<div><b>Current Stream:</b> ' + Utils.debugInfo.lastStream + '</div>' +
      '<div><b>Provider Timings:</b> ' + JSON.stringify(Utils.debugInfo.providerTimings) + '</div>';
    el.innerHTML = html;
  };

  // Safe object assign
  Utils.assign = function(target) {
    if (target === undefined || target === null) {
      target = {};
    }
    for (var i = 1; i < arguments.length; i++) {
      var source = arguments[i];
      if (source !== undefined && source !== null) {
        var keys = Object.keys(source);
        for (var k = 0; k < keys.length; k++) {
          var key = keys[k];
          target[key] = source[key];
        }
      }
    }
    return target;
  };

  // Convert SRT subtitles to WebVTT format
  Utils.srtToWebVTT = function(srtText) {
    if (!srtText) return '';
    // Normalize newlines
    var s = srtText.replace(/\r\n|\r/g, '\n');
    // Replace comma in timestamps: 00:01:20,000 -> 00:01:20.000
    s = s.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
    return 'WEBVTT\n\n' + s;
  };

  // Parse WebVTT text into cue objects: [{ start: seconds, end: seconds, text: string }]
  Utils.parseWebVTT = function(vttText) {
    var cues = [];
    if (!vttText) return cues;
    var lines = vttText.replace(/\r\n|\r/g, '\n').split('\n');
    var i = 0;
    while (i < lines.length) {
      var line = lines[i].trim();
      if (line.indexOf('-->') !== -1) {
        var parts = line.split('-->');
        var start = Utils.parseTimestamp(parts[0].trim());
        var end = Utils.parseTimestamp(parts[1].trim().split(' ')[0]);
        var textLines = [];
        i++;
        while (i < lines.length && lines[i].trim() !== '') {
          textLines.push(lines[i].trim());
          i++;
        }
        if (start !== null && end !== null && textLines.length > 0) {
          cues.push({
            start: start,
            end: end,
            text: textLines.join('<br>')
          });
        }
      } else {
        i++;
      }
    }
    return cues;
  };

  Utils.parseTimestamp = function(ts) {
    if (!ts) return null;
    var parts = ts.split(':');
    if (parts.length === 2) {
      var m = parseFloat(parts[0]);
      var s = parseFloat(parts[1]);
      return m * 60 + s;
    } else if (parts.length === 3) {
      var h = parseFloat(parts[0]);
      var m2 = parseFloat(parts[1]);
      var s2 = parseFloat(parts[2]);
      return h * 3600 + m2 * 60 + s2;
    }
    return null;
  };

  // Toast notification system
  Utils.showToast = function(msg, duration) {
    var toast = document.getElementById('vybe-toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.className = 'vybe-toast show';
    clearTimeout(Utils._toastTimer);
    Utils._toastTimer = setTimeout(function() {
      toast.className = 'vybe-toast';
    }, duration || 2500);
  };

  window.VYBE_UTILS = Utils;
})(window);
