/**
 * VYBE OTT - Production Player Engine & UI
 * Tailored for LG webOS TV (native HLS) + Browser preview (hls.js).
 * Full D-pad controls, custom subtitle renderer, drawer panel, failover chain.
 * Strict ES5/ES2015 compatible.
 */
(function(window) {
  'use strict';

  var Player = {};
  var utils = window.VYBE_UTILS;
  var config = window.VYBE_CONFIG;
  var api = window.VYBE_API;
  var streamsEngine = window.VYBE_STREAMS;

  // Internal state
  var videoEl = null;
  var hlsInstance = null;
  var currentStream = null;
  var previousWorkingStream = null;
  var currentTitleInfo = null; // { id, type, title, poster, backdrop, season, episode, nextEpisode }
  var availableProviders = {}; // providerKey -> streamList
  var activeProviderKey = '';
  var activeLanguage = '';
  var activeQualityRank = 1080;
  var isPlaying = false;
  var isControlsVisible = false;
  var controlsHideTimer = null;
  var progressSaveTimer = null;
  var failoverAttempts = 0;
  var subtitleCues = [];
  var activeSubtitle = null;
  var subtitleDelaySec = 0;
  var subtitleFontSize = 'medium'; // small (32px), medium (40px), large (48px)
  var isPanelOpen = false;
  var currentPanelTab = 'source'; // 'source', 'language', 'quality', 'subtitles'
  var nextEpisodeCountdownTimer = null;
  var nextEpisodeSecondsLeft = 10;
  var currentIsProxied = false;   // true when the URL actually loaded goes through /api/proxy
  var triedProviders = {};        // providers already given up on during failover
  var loadId = 0;                 // increments on every Engine.load()
  var lastErrorLoadId = -1;       // dedupe: one failover step per load
  var hlsNetRetries = 0;
  var hlsMediaRetries = 0;
  var MAX_HLS_RETRIES = 2;
  var MAX_FAILOVER_STEPS = 10;

  // Thin Player Engine
  var Engine = {
    init: function(videoNode) {
      if (videoEl === videoNode && Engine._bound) return;
      videoEl = videoNode;
      Engine._bound = true;
      Engine.bindVideoEvents();
    },

    bindVideoEvents: function() {
      if (!videoEl) return;

      videoEl.addEventListener('play', function() {
        isPlaying = true;
        Player.updatePlayPauseUI();
        Player.hideBuffering();
      });

      videoEl.addEventListener('pause', function() {
        isPlaying = false;
        Player.updatePlayPauseUI();
      });

      videoEl.addEventListener('waiting', function() {
        Player.showBuffering();
      });

      videoEl.addEventListener('playing', function() {
        Player.hideBuffering();
        failoverAttempts = 0; // reset on clean playback
        previousWorkingStream = currentStream;
        if (currentStream && currentIsProxied) {
          utils.storage.set('vybe_proxy_pref_' + currentStream.providerKey, true);
        }
      });

      videoEl.addEventListener('timeupdate', function() {
        Player.updateSeekBar();
        Player.renderSubtitles();
        Player.checkEpisodeEnd();
      });

      videoEl.addEventListener('ended', function() {
        Player.handleVideoEnded();
      });

      videoEl.addEventListener('error', function(e) {
        utils.log('Video error encountered:', e);
        Player.handlePlaybackError();
      });
    },

    load: function(url, startTime) {
      if (!videoEl) return;
      Player.showBuffering();

      loadId++;
      hlsNetRetries = 0;
      hlsMediaRetries = 0;
      // Many providers serve HLS without a .m3u8 extension -> treat everything that is not a plain file as HLS
      var plainUrl = url;
      try { plainUrl = decodeURIComponent(url); } catch (eDec) {}
      var isHls = !/\.(mp4|mkv|webm|m4v)(\?|&|$)/i.test(plainUrl);
      var canNativeHls = videoEl.canPlayType('application/vnd.apple.mpegurl');

      if (hlsInstance) {
        hlsInstance.destroy();
        hlsInstance = null;
      }

      if (isHls && !canNativeHls && window.Hls && window.Hls.isSupported()) {
        utils.log('Loading via hls.js fallback:', url);
        hlsInstance = new window.Hls({
          enableWorker: true,
          lowLatencyMode: false
        });
        hlsInstance.loadSource(url);
        hlsInstance.attachMedia(videoEl);

        hlsInstance.on(window.Hls.Events.MANIFEST_PARSED, function() {
          if (startTime > 0) {
            videoEl.currentTime = startTime;
          }
          var playProm = videoEl.play();
          if (playProm && playProm.catch) {
            playProm.catch(function(err) {
              utils.log('Autoplay blocked by browser policy:', err);
              utils.showToast('Press OK / Enter to start playback');
            });
          }
        });

        hlsInstance.on(window.Hls.Events.ERROR, function(evt, data) {
          if (data.fatal) {
            switch (data.type) {
              case window.Hls.ErrorTypes.NETWORK_ERROR:
                if (hlsNetRetries < MAX_HLS_RETRIES && hlsInstance) {
                  hlsNetRetries++;
                  hlsInstance.startLoad();
                } else {
                  Player.handlePlaybackError();
                }
                break;
              case window.Hls.ErrorTypes.MEDIA_ERROR:
                if (hlsMediaRetries < MAX_HLS_RETRIES && hlsInstance) {
                  hlsMediaRetries++;
                  hlsInstance.recoverMediaError();
                } else {
                  Player.handlePlaybackError();
                }
                break;
              default:
                utils.log('hls.js unrecoverable error:', data);
                Player.handlePlaybackError();
                break;
            }
          }
        });
      } else {
        // Native webOS playback (supports HLS & MP4 directly)
        utils.log('Loading via native video.src:', url);
        videoEl.src = url;
        if (startTime > 0) {
          var onLoadedMetadata = function() {
            videoEl.currentTime = startTime;
            videoEl.removeEventListener('loadedmetadata', onLoadedMetadata);
          };
          videoEl.addEventListener('loadedmetadata', onLoadedMetadata);
        }
        videoEl.load();
        var p = videoEl.play();
        if (p && p.catch) {
          p.catch(function(err) {
            utils.log('Native play catch:', err);
          });
        }
      }
    },

    play: function() {
      if (videoEl) videoEl.play().catch(function() {});
    },

    pause: function() {
      if (videoEl) videoEl.pause();
    },

    seek: function(timeSec) {
      if (!videoEl) return;
      var target = Math.max(0, Math.min(videoEl.duration || 0, timeSec));
      videoEl.currentTime = target;
      Player.updateSeekBar();
    },

    getCurrentTime: function() {
      return videoEl ? videoEl.currentTime : 0;
    },

    getDuration: function() {
      return videoEl ? videoEl.duration : 0;
    },

    destroy: function() {
      if (hlsInstance) {
        hlsInstance.destroy();
        hlsInstance = null;
      }
      if (videoEl) {
        videoEl.removeAttribute('src');
        videoEl.load();
      }
    }
  };

  /**
   * Open player with content metadata and grouped streams
   */
  Player.open = function(titleMeta, groupedStreams, startStream, resumePromptCallback) {
    currentTitleInfo = titleMeta;
    availableProviders = groupedStreams.byProvider || {};
    triedProviders = {};
    failoverAttempts = 0;
    lastErrorLoadId = -1;

    var targetStream = startStream || streamsEngine.autoSelectInitialStream(groupedStreams);
    if (!targetStream) {
      utils.showToast('No stream available for this title');
      return;
    }

    activeProviderKey = targetStream.providerKey;
    activeLanguage = targetStream.language;
    activeQualityRank = targetStream.qualityRank;
    currentStream = targetStream;

    document.getElementById('player-screen').classList.remove('hidden');
    document.getElementById('vybe-root').classList.add('in-player');

    Engine.init(document.getElementById('vybe-video-element'));
    Player.renderHeaderInfo();
    Player.setupSubtitles(currentStream.subtitles);

    // Check resume history
    var resumeKey = 'vybe_progress_' + titleMeta.type + '_' + titleMeta.id + (titleMeta.season ? ('_' + titleMeta.season + '_' + titleMeta.episode) : '');
    var savedProgress = utils.storage.get(resumeKey);

    if (savedProgress && savedProgress.position > 15 && (!savedProgress.duration || (savedProgress.position / savedProgress.duration) < 0.92)) {
      Player.showResumePrompt(savedProgress.position, function(doResume) {
        var startPos = doResume ? savedProgress.position : 0;
        Player.playStream(currentStream, startPos);
      });
    } else {
      Player.playStream(currentStream, 0);
    }

    Player.showControls();
    Player.startProgressSaving();
    window.VYBE_FOCUS.registerKeyListener(Player.handlePlayerKeys);
  };

  Player.playStream = function(stream, startPos, forceProxy) {
    currentStream = stream;
    isPlaying = false; // stale 'true' from the previous stream disabled the stall check
    utils.recordDebug('lastStream', stream.providerName + ' | ' + stream.language + ' | ' + stream.qualityLabel);

    var playUrl = api.buildPlayUrl(stream, forceProxy);
    currentIsProxied = playUrl.indexOf('/api/proxy?') !== -1;
    Engine.load(playUrl, startPos || 0);

    // If a DIRECT url has not started within 8 s, retry once through the proxy
    clearTimeout(Player._stallProxyTimer);
    if (!currentIsProxied) {
      Player._stallProxyTimer = setTimeout(function() {
        if (!isPlaying && Engine.getCurrentTime() === 0) {
          utils.log('Playback stalled on direct URL, retrying via proxy');
          Player.playStream(stream, startPos, true);
        }
      }, 8000);
    }
  };

  /**
   * Live provider updates: streams from slower providers keep arriving after the player opened
   */
  Player.isOpen = function() {
    var el = document.getElementById('player-screen');
    return !!(el && !el.classList.contains('hidden'));
  };

  Player.updateProviders = function(groupedStreams) {
    if (groupedStreams && groupedStreams.byProvider) {
      availableProviders = groupedStreams.byProvider;
    }
  };

  /**
   * Automatic Failover Chain
   */
  Player.handlePlaybackError = function() {
    clearTimeout(Player._stallProxyTimer);

    // One failover step per load (video 'error' + hls.js fatal can both fire for the same failure)
    if (lastErrorLoadId === loadId) return;
    lastErrorLoadId = loadId;

    failoverAttempts++;
    if (failoverAttempts > MAX_FAILOVER_STEPS) {
      Player.showErrorDialog('Could not play stream from sources. Please try another source.');
      return;
    }

    if (!currentStream) {
      Player.showErrorDialog('Unable to play video.');
      return;
    }

    var currentTime = Engine.getCurrentTime();

    // 1. Try extra mirrors (work on a copy, never mutate the cached stream)
    if (currentStream.mirrors && currentStream.mirrors.length > 0) {
      var mirrorStream = Object.assign({}, currentStream, {
        url: currentStream.mirrors[0],
        mirrors: currentStream.mirrors.slice(1)
      });
      utils.showToast('Connecting to backup mirror...');
      Player.playStream(mirrorStream, currentTime);
      return;
    }

    // 2. Retry through the proxy once (uses the real loaded state, not the raw url)
    if (!currentIsProxied) {
      utils.showToast('Retrying via stream proxy...');
      Player.playStream(currentStream, currentTime, true);
      return;
    }

    // 3. Next quality down within current provider + language
    var provStreams = availableProviders[activeProviderKey] || [];
    var lowerQualities = [];
    for (var i = 0; i < provStreams.length; i++) {
      var s = provStreams[i];
      if (s.language === activeLanguage && s.qualityRank < activeQualityRank) {
        lowerQualities.push(s);
      }
    }
    if (lowerQualities.length > 0) {
      lowerQualities.sort(function(a, b) { return b.qualityRank - a.qualityRank; });
      var lowerStream = lowerQualities[0];
      utils.showToast('Switching to ' + lowerStream.qualityLabel + '...');
      activeQualityRank = lowerStream.qualityRank;
      Player.playStream(lowerStream, currentTime);
      return;
    }

    // 4. Next UNTRIED provider, in configured preference order
    triedProviders[activeProviderKey] = true;
    var order = config.PROVIDER_ORDER || [];
    var allKeys = Object.keys(availableProviders).sort(function(a, b) {
      var ia = order.indexOf(a); if (ia === -1) ia = 999;
      var ib = order.indexOf(b); if (ib === -1) ib = 999;
      return ia - ib;
    });
    for (var k = 0; k < allKeys.length; k++) {
      var cand = allKeys[k];
      var candList = availableProviders[cand];
      if (!triedProviders[cand] && candList && candList.length > 0) {
        utils.showToast('Switching to ' + candList[0].providerName + '...');
        activeProviderKey = cand;
        activeLanguage = candList[0].language;
        activeQualityRank = candList[0].qualityRank;
        Player.playStream(candList[0], currentTime);
        return;
      }
    }

    // 5. Failover exhausted
    Player.showErrorDialog('Could not play stream from sources. Please try another source.');
  };

  /**
   * Switch stream while preserving playback position
   */
  Player.switchStream = function(newStream) {
    if (!newStream) return;
    var currentTime = Engine.getCurrentTime();
    triedProviders = {};
    failoverAttempts = 0;
    utils.showToast('Switching to ' + newStream.providerName + ' · ' + newStream.language + ' · ' + newStream.qualityLabel + '...');

    activeProviderKey = newStream.providerKey;
    activeLanguage = newStream.language;
    activeQualityRank = newStream.qualityRank;
    currentStream = newStream;

    Player.setupSubtitles(newStream.subtitles);
    Player.playStream(newStream, currentTime);
    Player.renderHeaderInfo();
  };

  /**
   * Subtitle management: fetch through proxy and sync on timeupdate
   */
  Player.setupSubtitles = function(subtitles) {
    var userPref = utils.storage.get('vybe_settings', config.DEFAULTS);
    var prefSub = (userPref && userPref.defaultSubtitle) || 'Off';

    activeSubtitle = null;
    subtitleCues = [];
    var subOverlay = document.getElementById('vybe-subtitle-overlay');
    if (subOverlay) subOverlay.innerHTML = '';

    if (!subtitles || !subtitles.length) return;

    if (prefSub !== 'Off') {
      for (var i = 0; i < subtitles.length; i++) {
        if (subtitles[i].langCode.toLowerCase() === prefSub.toLowerCase() || subtitles[i].label.toLowerCase().indexOf(prefSub.toLowerCase()) !== -1) {
          Player.selectSubtitle(subtitles[i]);
          break;
        }
      }
    }
  };

  Player.selectSubtitle = function(subObj) {
    if (!subObj) {
      activeSubtitle = null;
      subtitleCues = [];
      var overlay = document.getElementById('vybe-subtitle-overlay');
      if (overlay) overlay.innerHTML = '';
      utils.showToast('Subtitles: Off');
      return;
    }

    activeSubtitle = subObj;
    utils.showToast('Loading subtitles: ' + subObj.label + '...');

    api.fetchSubtitleTrack(subObj).then(function(cues) {
      subtitleCues = cues;
      utils.showToast('Subtitles enabled: ' + subObj.label);
    }).catch(function(err) {
      utils.log('Failed to load subtitles:', err);
      utils.showToast('Subtitle load failed');
    });
  };

  Player.renderSubtitles = function() {
    var overlay = document.getElementById('vybe-subtitle-overlay');
    if (!overlay || !activeSubtitle || !subtitleCues.length) return;

    var curTime = Engine.getCurrentTime() + subtitleDelaySec;
    var activeCueText = '';

    for (var i = 0; i < subtitleCues.length; i++) {
      var cue = subtitleCues[i];
      if (curTime >= cue.start && curTime <= cue.end) {
        activeCueText = cue.text;
        break;
      }
    }

    if (overlay.innerHTML !== activeCueText) {
      overlay.innerHTML = activeCueText;
      overlay.className = 'vybe-subtitle-overlay size-' + subtitleFontSize + (activeCueText ? ' visible' : '');
    }
  };

  /**
   * Save progress to localStorage every 10s
   */
  Player.startProgressSaving = function() {
    clearInterval(progressSaveTimer);
    progressSaveTimer = setInterval(function() {
      if (!currentTitleInfo || !videoEl) return;
      var cur = Engine.getCurrentTime();
      var dur = Engine.getDuration();
      if (cur < 10 || !dur) return;

      var progressKey = 'vybe_progress_' + currentTitleInfo.type + '_' + currentTitleInfo.id + (currentTitleInfo.season ? ('_' + currentTitleInfo.season + '_' + currentTitleInfo.episode) : '');

      if (cur / dur >= 0.92) {
        // Watched >92%, clean entry
        utils.storage.remove(progressKey);
      } else {
        utils.storage.set(progressKey, {
          tmdbId: currentTitleInfo.id,
          type: currentTitleInfo.type,
          season: currentTitleInfo.season,
          episode: currentTitleInfo.episode,
          position: Math.floor(cur),
          duration: Math.floor(dur),
          providerKey: activeProviderKey,
          language: activeLanguage,
          qualityRank: activeQualityRank,
          title: currentTitleInfo.title,
          poster: currentTitleInfo.poster,
          backdrop: currentTitleInfo.backdrop,
          updatedAt: Date.now()
        });
      }
    }, 10000);
  };

  /**
   * Continue watching check & next episode autoplay
   */
  Player.checkEpisodeEnd = function() {
    if (!currentTitleInfo || currentTitleInfo.type !== 'tv' || !currentTitleInfo.nextEpisode) return;
    var cur = Engine.getCurrentTime();
    var dur = Engine.getDuration();
    if (dur > 0 && dur - cur <= 15 && !nextEpisodeCountdownTimer) {
      Player.showNextEpisodePrompt();
    }
  };

  Player.showNextEpisodePrompt = function() {
    var container = document.getElementById('player-next-ep-prompt');
    if (!container || !currentTitleInfo.nextEpisode) return;

    nextEpisodeSecondsLeft = 10;
    container.classList.remove('hidden');
    document.getElementById('next-ep-title').textContent = currentTitleInfo.nextEpisode.name || ('Episode ' + currentTitleInfo.nextEpisode.episode_number);
    document.getElementById('next-ep-countdown').textContent = nextEpisodeSecondsLeft;

    clearInterval(nextEpisodeCountdownTimer);
    nextEpisodeCountdownTimer = setInterval(function() {
      nextEpisodeSecondsLeft--;
      document.getElementById('next-ep-countdown').textContent = nextEpisodeSecondsLeft;
      if (nextEpisodeSecondsLeft <= 0) {
        clearInterval(nextEpisodeCountdownTimer);
        nextEpisodeCountdownTimer = null;
        Player.playNextEpisode();
      }
    }, 1000);

    // Focus Play Next button
    window.VYBE_FOCUS.setFocus(document.getElementById('btn-play-next-now'));
  };

  Player.cancelNextEpisode = function() {
    clearInterval(nextEpisodeCountdownTimer);
    nextEpisodeCountdownTimer = null;
    var container = document.getElementById('player-next-ep-prompt');
    if (container) container.classList.add('hidden');
    window.VYBE_FOCUS.setFocus(document.getElementById('btn-player-play'));
  };

  Player.playNextEpisode = function() {
    Player.cancelNextEpisode();
    if (currentTitleInfo && currentTitleInfo.playNextCallback) {
      currentTitleInfo.playNextCallback();
    }
  };

  Player.handleVideoEnded = function() {
    if (currentTitleInfo && currentTitleInfo.type === 'tv' && currentTitleInfo.nextEpisode) {
      Player.playNextEpisode();
    } else {
      Player.showControls();
    }
  };

  /**
   * Controls Visibility & UI Sync
   */
  Player.showControls = function() {
    var overlay = document.getElementById('player-controls-overlay');
    if (!overlay) return;
    overlay.classList.remove('fade-out');
    overlay.classList.add('fade-in');
    isControlsVisible = true;

    clearTimeout(controlsHideTimer);
    if (isPlaying && !isPanelOpen) {
      controlsHideTimer = setTimeout(function() {
        Player.hideControls();
      }, 4000);
    }
  };

  Player.hideControls = function() {
    if (isPanelOpen) return;
    var overlay = document.getElementById('player-controls-overlay');
    if (!overlay) return;
    overlay.classList.remove('fade-in');
    overlay.classList.add('fade-out');
    isControlsVisible = false;
  };

  Player.toggleControls = function() {
    if (isControlsVisible) {
      Player.hideControls();
    } else {
      Player.showControls();
    }
  };

  Player.updatePlayPauseUI = function() {
    var btn = document.getElementById('btn-player-play');
    if (!btn) return;
    btn.innerHTML = isPlaying ? '<span class="icon">&#10074;&#10074;</span> Pause' : '<span class="icon">&#9658;</span> Play';
  };

  Player.updateSeekBar = function() {
    var cur = Engine.getCurrentTime();
    var dur = Engine.getDuration();

    var curTimeEl = document.getElementById('player-cur-time');
    var totalTimeEl = document.getElementById('player-total-time');
    var progressEl = document.getElementById('player-progress-bar');

    if (curTimeEl) curTimeEl.textContent = utils.formatTime(cur);
    if (totalTimeEl) totalTimeEl.textContent = utils.formatTime(dur);

    if (progressEl && dur > 0) {
      var pct = (cur / dur) * 100;
      progressEl.style.width = pct + '%';
    }
  };

  Player.showBuffering = function() {
    var spinner = document.getElementById('player-buffering-spinner');
    if (spinner) spinner.classList.remove('hidden');
  };

  Player.hideBuffering = function() {
    var spinner = document.getElementById('player-buffering-spinner');
    if (spinner) spinner.classList.add('hidden');
  };

  Player.renderHeaderInfo = function() {
    var titleEl = document.getElementById('player-title-display');
    var metaEl = document.getElementById('player-source-summary');
    if (titleEl && currentTitleInfo) {
      var text = currentTitleInfo.title;
      if (currentTitleInfo.type === 'tv' && currentTitleInfo.season) {
        text += ' (S' + currentTitleInfo.season + ' E' + currentTitleInfo.episode + ')';
      }
      titleEl.textContent = text;
    }
    if (metaEl && currentStream) {
      metaEl.textContent = currentStream.providerName + ' · ' + currentStream.language + ' · ' + currentStream.qualityLabel;
    }
  };

  /**
   * Resume Prompt Modal
   */
  Player.showResumePrompt = function(pos, callback) {
    var modal = document.getElementById('player-resume-modal');
    if (!modal) {
      callback(false);
      return;
    }
    document.getElementById('resume-time-text').textContent = utils.formatTime(pos);
    modal.classList.remove('hidden');

    var btnResume = document.getElementById('btn-resume-yes');
    var btnStartOver = document.getElementById('btn-resume-no');

    btnResume.onclick = function() {
      modal.classList.add('hidden');
      callback(true);
    };
    btnStartOver.onclick = function() {
      modal.classList.add('hidden');
      callback(false);
    };

    window.VYBE_FOCUS.setFocus(btnResume);
  };

  /**
   * Settings Drawer Panel (4 Tabs: Source, Language, Quality, Subtitles)
   */
  Player.openPanel = function(tab) {
    isPanelOpen = true;
    currentPanelTab = tab || 'source';
    var drawer = document.getElementById('player-settings-drawer');
    if (!drawer) return;
    drawer.classList.add('open');
    Player.renderPanelContent();
  };

  Player.closePanel = function() {
    isPanelOpen = false;
    var drawer = document.getElementById('player-settings-drawer');
    if (drawer) drawer.classList.remove('open');
    Player.showControls();
    window.VYBE_FOCUS.setFocus(document.getElementById('btn-player-settings'));
  };

  Player.switchPanelTab = function(tab) {
    currentPanelTab = tab;
    Player.renderPanelContent();
  };

  Player.renderPanelContent = function() {
    var drawer = document.getElementById('player-settings-drawer');
    if (!drawer) return;

    var tabs = ['source', 'language', 'quality', 'subtitles'];
    var tabsHtml = '<div class="panel-tabs">';
    for (var t = 0; t < tabs.length; t++) {
      var tabName = tabs[t];
      var label = tabName.charAt(0).toUpperCase() + tabName.slice(1);
      var isCurrent = tabName === currentPanelTab;
      tabsHtml += '<button class="panel-tab-btn focusable' + (isCurrent ? ' active' : '') + '" data-nav-group="panel-tabs" onclick="VYBE_PLAYER.switchPanelTab(\'' + tabName + '\')">' + label + '</button>';
    }
    tabsHtml += '</div>';

    var listHtml = '<div class="panel-item-list" data-nav-group="panel-items">';

    if (currentPanelTab === 'source') {
      var providers = Object.keys(availableProviders);
      for (var p = 0; p < providers.length; p++) {
        var pKey = providers[p];
        var pStreams = availableProviders[pKey] || [];
        var isCur = pKey === activeProviderKey;
        var pName = pStreams.length > 0 ? pStreams[0].providerName : pKey;
        listHtml += '<button class="panel-list-btn focusable' + (isCur ? ' selected' : '') + '" onclick="VYBE_PLAYER.onSelectProvider(\'' + pKey + '\')">' +
          '<span class="title">' + pName + '</span>' +
          '<span class="meta">' + pStreams.length + ' streams' + (isCur ? ' (Active)' : '') + '</span>' +
          '</button>';
      }
    } else if (currentPanelTab === 'language') {
      // Current provider languages only!
      var curProvStreams = availableProviders[activeProviderKey] || [];
      var langs = streamsEngine.getLanguagesForProvider(curProvStreams);
      for (var l = 0; l < langs.length; l++) {
        var langName = langs[l];
        var isCurLang = langName === activeLanguage;
        listHtml += '<button class="panel-list-btn focusable' + (isCurLang ? ' selected' : '') + '" onclick="VYBE_PLAYER.onSelectLanguage(\'' + langName + '\')">' +
          '<span class="title">' + langName + '</span>' +
          (isCurLang ? '<span class="meta">&#10003; Selected</span>' : '') +
          '</button>';
      }
    } else if (currentPanelTab === 'quality') {
      // Current provider + language qualities only!
      var curStreams = availableProviders[activeProviderKey] || [];
      var qualities = streamsEngine.getQualitiesForLanguage(curStreams, activeLanguage);
      for (var q = 0; q < qualities.length; q++) {
        var qObj = qualities[q];
        var isCurQ = qObj.rank === activeQualityRank;
        listHtml += '<button class="panel-list-btn focusable' + (isCurQ ? ' selected' : '') + '" onclick="VYBE_PLAYER.onSelectQuality(' + qObj.rank + ')">' +
          '<span class="title">' + qObj.label + '</span>' +
          '<span class="meta">' + (qObj.sizeText ? qObj.sizeText + ' ' : '') + (isCurQ ? '&#10003; Active' : '') + '</span>' +
          '</button>';
      }
    } else if (currentPanelTab === 'subtitles') {
      // Subtitle options + Off + Size & Delay
      var subs = (currentStream && currentStream.subtitles) || [];
      var isOff = activeSubtitle === null;
      listHtml += '<button class="panel-list-btn focusable' + (isOff ? ' selected' : '') + '" onclick="VYBE_PLAYER.selectSubtitle(null)">' +
        '<span class="title">Off</span>' +
        (isOff ? '<span class="meta">&#10003; Active</span>' : '') +
        '</button>';

      for (var s = 0; s < subs.length; s++) {
        var subItem = subs[s];
        var isCurSub = activeSubtitle && activeSubtitle.url === subItem.url;
        listHtml += '<button class="panel-list-btn focusable' + (isCurSub ? ' selected' : '') + '" onclick="VYBE_PLAYER.selectSubtitleFromIndex(' + s + ')">' +
          '<span class="title">' + subItem.label + '</span>' +
          '<span class="meta">' + subItem.langCode.toUpperCase() + (isCurSub ? ' &#10003;' : '') + '</span>' +
          '</button>';
      }

      listHtml += '<div class="panel-sub-controls">' +
        '<div class="label">Text Size:</div>' +
        '<button class="sub-ctrl-btn focusable' + (subtitleFontSize === 'small' ? ' active' : '') + '" onclick="VYBE_PLAYER.setSubtitleSize(\'small\')">S</button>' +
        '<button class="sub-ctrl-btn focusable' + (subtitleFontSize === 'medium' ? ' active' : '') + '" onclick="VYBE_PLAYER.setSubtitleSize(\'medium\')">M</button>' +
        '<button class="sub-ctrl-btn focusable' + (subtitleFontSize === 'large' ? ' active' : '') + '" onclick="VYBE_PLAYER.setSubtitleSize(\'large\')">L</button>' +
        '</div>';
    }

    listHtml += '</div>';

    drawer.innerHTML = '<div class="drawer-header">' +
      '<h3>Player Settings</h3>' +
      '<button class="btn-close-drawer focusable" onclick="VYBE_PLAYER.closePanel()">&#10005;</button>' +
      '</div>' + tabsHtml + listHtml;

    // Focus active or first item
    var targetFocus = drawer.querySelector('.panel-list-btn.selected') || drawer.querySelector('.panel-list-btn') || drawer.querySelector('.panel-tab-btn.active');
    if (targetFocus) {
      window.VYBE_FOCUS.setFocus(targetFocus);
    }
  };

  Player.onSelectProvider = function(pKey) {
    if (pKey === activeProviderKey) {
      Player.closePanel();
      return;
    }
    var pStreams = availableProviders[pKey] || [];
    if (!pStreams.length) return;

    // Hierarchy rule: Provider -> recompute Language & Quality, resume at same time
    var targetStream = streamsEngine.findStream(availableProviders, pKey, activeLanguage, activeQualityRank);
    Player.switchStream(targetStream);
    Player.closePanel();
  };

  Player.onSelectLanguage = function(langName) {
    if (langName === activeLanguage) {
      Player.closePanel();
      return;
    }
    var targetStream = streamsEngine.findStream(availableProviders, activeProviderKey, langName, activeQualityRank);
    Player.switchStream(targetStream);
    Player.closePanel();
  };

  Player.onSelectQuality = function(qRank) {
    if (qRank === activeQualityRank) {
      Player.closePanel();
      return;
    }
    var targetStream = streamsEngine.findStream(availableProviders, activeProviderKey, activeLanguage, qRank);
    Player.switchStream(targetStream);
    Player.closePanel();
  };

  Player.selectSubtitleFromIndex = function(index) {
    var subs = (currentStream && currentStream.subtitles) || [];
    if (subs[index]) {
      Player.selectSubtitle(subs[index]);
    }
    Player.closePanel();
  };

  Player.setSubtitleSize = function(size) {
    subtitleFontSize = size;
    Player.renderSubtitles();
    Player.renderPanelContent();
  };

  /**
   * Remote & Keyboard Key Handlers
   * WebOS Key codes:
   * 13 Enter, 37 Left, 38 Up, 39 Right, 40 Down
   * 461 Back, 8 Backspace, 27 Esc
   * 415 Play, 19 Pause, 413 Stop, 417 FastForward, 412 Rewind
   */
  Player.handlePlayerKeys = function(keyCode, e) {
    var playerScreen = document.getElementById('player-screen');
    if (playerScreen.classList.contains('hidden')) return false;

    // Always wake controls on key press
    Player.showControls();

    // 1. Back button (461 webOS, 8 Backspace, 27 Esc)
    if (keyCode === 461 || keyCode === 8 || keyCode === 27) {
      if (isPanelOpen) {
        Player.closePanel();
        return true;
      }
      var resumeModal = document.getElementById('player-resume-modal');
      if (resumeModal && !resumeModal.classList.contains('hidden')) {
        resumeModal.classList.add('hidden');
        Player.close();
        return true;
      }
      Player.close();
      return true;
    }

    // 2. Play / Pause keys (415, 19, or Space 32)
    if (keyCode === 415 || keyCode === 19 || keyCode === 32) {
      if (isPlaying) {
        Engine.pause();
      } else {
        Engine.play();
      }
      return true;
    }

    // 3. FastForward (417) & Rewind (412) keys (±30s)
    if (keyCode === 417) {
      Engine.seek(Engine.getCurrentTime() + 30);
      return true;
    }
    if (keyCode === 412) {
      Engine.seek(Engine.getCurrentTime() - 30);
      return true;
    }

    // 4. In Drawer Panel navigation
    if (isPanelOpen) {
      // Let standard focus manager navigate panel items
      return false;
    }

    // 5. Up key opens controls if hidden
    if (keyCode === 38 && !isControlsVisible) {
      Player.showControls();
      window.VYBE_FOCUS.setFocus(document.getElementById('btn-player-play'));
      return true;
    }

    // 6. Down key opens settings panel directly
    if (keyCode === 40 && !isPanelOpen && !isControlsVisible) {
      Player.openPanel('source');
      return true;
    }

    // 7. Left/Right on video container for quick ±10s seek
    var curFocused = window.VYBE_FOCUS.getCurrent();
    var isSeekingOnBar = curFocused && curFocused.id === 'player-seek-slider';
    if (!isSeekingOnBar && (keyCode === 37 || keyCode === 39)) {
      if (curFocused && (curFocused.classList.contains('ctrl-btn') || curFocused.classList.contains('focusable'))) {
        // Let D-pad move between buttons
        return false;
      }
      var delta = keyCode === 39 ? 10 : -10;
      Engine.seek(Engine.getCurrentTime() + delta);
      return true;
    }

    return false;
  };

  Player.showErrorDialog = function(msg) {
    Player.hideBuffering();
    var dialog = document.getElementById('player-error-modal');
    if (!dialog) return;
    document.getElementById('player-error-text').textContent = msg;
    dialog.classList.remove('hidden');

    var btnRetry = document.getElementById('btn-error-retry-source');
    var btnBack = document.getElementById('btn-error-back');

    btnRetry.onclick = function() {
      dialog.classList.add('hidden');
      Player.openPanel('source');
    };
    btnBack.onclick = function() {
      dialog.classList.add('hidden');
      Player.close();
    };

    window.VYBE_FOCUS.setFocus(btnRetry);
  };

  /**
   * Close Player and return to previous screen
   */
  Player.close = function() {
    clearInterval(progressSaveTimer);
    clearTimeout(controlsHideTimer);
    clearTimeout(Player._stallProxyTimer);
    clearInterval(nextEpisodeCountdownTimer);
    nextEpisodeCountdownTimer = null;   // stale id blocked the next-episode prompt in later sessions
    var nextPrompt = document.getElementById('player-next-ep-prompt');
    if (nextPrompt) nextPrompt.classList.add('hidden');

    window.VYBE_FOCUS.unregisterKeyListener(Player.handlePlayerKeys);
    Engine.destroy();

    document.getElementById('player-screen').classList.add('hidden');
    document.getElementById('vybe-root').classList.remove('in-player');

    // Restore screen focus
    if (window.VYBE_APP) {
      window.VYBE_APP.restoreScreenFocus();
    }
  };

  window.VYBE_PLAYER = Player;
})(window);
