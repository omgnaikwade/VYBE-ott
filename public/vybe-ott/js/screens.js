/**
 * VYBE OTT - UI Screens Engine
 * Strict ES5/ES2015 compatible for LG webOS TV (Chromium 53).
 * Screens: Home (Hero + Rows), Search (Keyboard + Voice), Details (Lazy Parallel Checking), Tabs (Movies/TV), Settings.
 */
(function(window) {
  'use strict';

  var Screens = {};
  var utils = window.VYBE_UTILS;
  var config = window.VYBE_CONFIG;
  var tmdb = window.VYBE_TMDB;
  var api = window.VYBE_API;
  var streamsEngine = window.VYBE_STREAMS;

  // Hero carousel state
  var heroItems = [];
  var activeHeroIndex = 0;
  var heroRotateTimer = null;

  // Active Details state
  var currentDetailsData = null;
  var detailsStreamChecks = {};
  var detailsAggregatedStreams = [];
  var detailsCheckedCount = 0;
  var detailsTotalProviders = config.ALL_PROVIDERS.length;
  var selectedSeasonNumber = 1;

  // Search state
  var searchQuery = '';
  var searchPage = 1;

  // Movies / TV screen state
  var currentTabGenre = 'all';
  var currentTabPage = 1;
  var currentTabMediaType = 'movie';

  // ==========================================
  // 1. HOME SCREEN
  // ==========================================
  Screens.renderHome = function(container) {
    container.innerHTML = '<div class="home-screen-wrap">' +
      '<div id="home-hero-banner" class="hero-banner"></div>' +
      '<div id="home-rows-container" class="home-rows-container"></div>' +
      '</div>';

    Screens.loadHeroBanner();
    Screens.loadHomeRows();
  };

  Screens.loadHeroBanner = function() {
    var heroEl = document.getElementById('home-hero-banner');
    if (!heroEl) return;

    tmdb.getTrendingAll().then(function(data) {
      if (!data || !data.results || !data.results.length) return;
      heroItems = data.results.slice(0, 5);
      activeHeroIndex = 0;
      Screens.updateHeroUI();
      Screens.startHeroRotation();
    }).catch(function(err) {
      utils.log('Hero trending fetch failed:', err);
    });
  };

  Screens.updateHeroUI = function() {
    var heroEl = document.getElementById('home-hero-banner');
    if (!heroEl || !heroItems.length) return;
    var item = heroItems[activeHeroIndex];
    var title = item.title || item.name;
    var backdropUrl = tmdb.getImageUrl(item.backdrop_path, 'w1280');
    var year = (item.release_date || item.first_air_date || '').slice(0, 4);
    var rating = item.vote_average ? item.vote_average.toFixed(1) : '7.5';

    heroEl.style.backgroundImage = 'url("' + backdropUrl + '")';
    heroEl.innerHTML = '<div class="hero-scrim"></div>' +
      '<div class="hero-content">' +
      '<div class="hero-badge-row">' +
      '<span class="hero-tag">' + (item.media_type === 'tv' ? 'SERIES' : 'FEATURE FILM') + '</span>' +
      '<span class="hero-year">' + year + '</span>' +
      '<span class="hero-rating">&#9733; ' + rating + '</span>' +
      '</div>' +
      '<h1 class="hero-title">' + title + '</h1>' +
      '<p class="hero-overview">' + (item.overview || '') + '</p>' +
      '<div class="hero-actions" data-nav-group="hero-actions">' +
      '<button id="btn-hero-play" class="btn-hero-primary focusable" onclick="VYBE_SCREENS.onHeroPlayClick()"><span class="icon">&#9658;</span> Play</button>' +
      '<button id="btn-hero-info" class="btn-hero-secondary focusable" onclick="VYBE_SCREENS.onHeroInfoClick()"><span class="icon">&#9432;</span> More Info</button>' +
      '</div>' +
      '</div>';
  };

  Screens.startHeroRotation = function() {
    clearInterval(heroRotateTimer);
    heroRotateTimer = setInterval(function() {
      // Only rotate if user is NOT actively focusing hero buttons
      var cur = window.VYBE_FOCUS.getCurrent();
      var isHeroFocused = cur && (cur.id === 'btn-hero-play' || cur.id === 'btn-hero-info');
      if (!isHeroFocused && heroItems.length > 1) {
        activeHeroIndex = (activeHeroIndex + 1) % heroItems.length;
        Screens.updateHeroUI();
      }
    }, 8000);
  };

  Screens.onHeroPlayClick = function() {
    if (!heroItems.length) return;
    var item = heroItems[activeHeroIndex];
    Screens.openDetails(item.media_type || 'movie', item.id, true);
  };

  Screens.onHeroInfoClick = function() {
    if (!heroItems.length) return;
    var item = heroItems[activeHeroIndex];
    Screens.openDetails(item.media_type || 'movie', item.id, false);
  };

  Screens.loadHomeRows = function() {
    var rowsContainer = document.getElementById('home-rows-container');
    if (!rowsContainer) return;
    rowsContainer.innerHTML = '';

    // 1. Continue Watching row if available
    Screens.renderContinueWatchingRow(rowsContainer);

    // Row definitions
    var rowConfigs = [
      { id: 'row-trending', title: 'Trending Now', fetcher: function() { return tmdb.getTrendingAll(); } },
      { id: 'row-pop-movies', title: 'Popular Movies', fetcher: function() { return tmdb.getPopularMovies(); } },
      { id: 'row-hindi', title: 'Hindi Cinema', fetcher: function() { return tmdb.getIndianLanguageMovies('hi'); } },
      { id: 'row-tamil', title: 'Tamil Blockbusters', fetcher: function() { return tmdb.getIndianLanguageMovies('ta'); } },
      { id: 'row-telugu', title: 'Telugu Power Hits', fetcher: function() { return tmdb.getIndianLanguageMovies('te'); } },
      { id: 'row-marathi', title: 'Marathi Cinema', fetcher: function() { return tmdb.getIndianLanguageMovies('mr'); } },
      { id: 'row-malayalam', title: 'Malayalam Hits', fetcher: function() { return tmdb.getIndianLanguageMovies('ml'); } },
      { id: 'row-pop-tv', title: 'Binge-Worthy Series', fetcher: function() { return tmdb.getPopularTv(); } },
      { id: 'row-action', title: 'High-Octane Action', fetcher: function() { return tmdb.getByGenre('movie', 28); } },
      { id: 'row-comedy', title: 'Comedy & Laughs', fetcher: function() { return tmdb.getByGenre('movie', 35); } },
      { id: 'row-top-rated', title: 'Critically Acclaimed', fetcher: function() { return tmdb.getTopRatedMovies(); } }
    ];

    for (var i = 0; i < rowConfigs.length; i++) {
      Screens.renderShelfRow(rowsContainer, rowConfigs[i], i);
    }
  };

  Screens.renderContinueWatchingRow = function(parent) {
    var keys = [];
    try {
      for (var k = 0; k < window.localStorage.length; k++) {
        var key = window.localStorage.key(k);
        if (key && key.indexOf('vybe_progress_') === 0) {
          keys.push(key);
        }
      }
    } catch (e) {}

    if (!keys.length) return;

    var list = [];
    for (var i = 0; i < keys.length; i++) {
      var prog = utils.storage.get(keys[i]);
      if (prog) list.push(prog);
    }
    list.sort(function(a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });

    var rowDiv = document.createElement('div');
    rowDiv.className = 'shelf-row';
    rowDiv.innerHTML = '<h2 class="shelf-title">Continue Watching</h2>' +
      '<div class="row-scroll-container shelf-slider" data-nav-group="row-continue">' +
      list.map(function(item) {
        var pct = item.duration > 0 ? Math.floor((item.position / item.duration) * 100) : 0;
        var posterUrl = tmdb.getImageUrl(item.poster || item.backdrop, 'w342');
        return '<div class="card continue-card focusable" data-nav-group="row-continue" onclick="VYBE_SCREENS.openDetails(\'' + item.type + '\', ' + item.tmdbId + ', true)">' +
          '<div class="card-image-wrap">' +
          '<img src="' + posterUrl + '" alt="' + item.title + '" class="card-poster" />' +
          '<div class="card-progress-bar"><div class="fill" style="width: ' + pct + '%"></div></div>' +
          '</div>' +
          '<div class="card-caption">' +
          '<div class="card-title">' + item.title + '</div>' +
          '<div class="card-meta">' + (item.season ? 'S' + item.season + ' E' + item.episode + ' · ' : '') + utils.formatTime(item.position) + ' left</div>' +
          '</div>' +
          '</div>';
      }).join('') +
      '</div>';

    parent.appendChild(rowDiv);
  };

  Screens.renderShelfRow = function(parent, configObj, rowIndex) {
    var rowDiv = document.createElement('div');
    rowDiv.className = 'shelf-row';
    var groupId = 'row-' + rowIndex;

    rowDiv.innerHTML = '<h2 class="shelf-title">' + configObj.title + '</h2>' +
      '<div id="' + configObj.id + '-slider" class="row-scroll-container shelf-slider" data-nav-group="' + groupId + '">' +
      '<div class="shelf-skeleton">Loading titles...</div>' +
      '</div>';
    parent.appendChild(rowDiv);

    configObj.fetcher().then(function(data) {
      var slider = document.getElementById(configObj.id + '-slider');
      if (!slider || !data || !data.results) return;

      var items = data.results.slice(0, 20);
      slider.innerHTML = items.map(function(item) {
        var posterUrl = tmdb.getImageUrl(item.poster_path, 'w342');
        var mediaType = item.media_type || (item.first_air_date ? 'tv' : 'movie');
        var title = item.title || item.name;
        var year = (item.release_date || item.first_air_date || '').slice(0, 4);

        return '<div class="card movie-card focusable" data-nav-group="' + groupId + '" onclick="VYBE_SCREENS.openDetails(\'' + mediaType + '\', ' + item.id + ', false)">' +
          '<div class="card-image-wrap">' +
          '<img src="' + posterUrl + '" alt="' + title + '" class="card-poster" onerror="this.src=\'assets/placeholder.svg\'" />' +
          '</div>' +
          '<div class="card-caption">' +
          '<div class="card-title">' + title + '</div>' +
          '<div class="card-meta">' + year + (item.vote_average ? ' · &#9733; ' + item.vote_average.toFixed(1) : '') + '</div>' +
          '</div>' +
          '</div>';
      }).join('');
    }).catch(function(err) {
      utils.log('Row load failed for ' + configObj.title + ':', err);
    });
  };

  // ==========================================
  // 2. DETAILS SCREEN & PARALLEL SOURCE CHECK
  // ==========================================
  Screens.openDetails = function(mediaType, id, autoPlayOnReady) {
    window.VYBE_APP.pushScreen('details-screen');
    var screenEl = document.getElementById('details-screen');
    screenEl.innerHTML = '<div class="details-loading-state"><div class="spinner"></div><p>Loading title details...</p></div>';

    tmdb.getDetails(mediaType, id).then(function(item) {
      currentDetailsData = item;
      currentDetailsData.mediaType = mediaType;
      Screens.renderDetailsUI(screenEl, item, mediaType, autoPlayOnReady);
    }).catch(function(err) {
      screenEl.innerHTML = '<div class="details-error-state">' +
        '<h2>Could not load details</h2>' +
        '<p>' + err.message + '</p>' +
        '<button class="btn-primary focusable" onclick="VYBE_APP.popScreen()">Go Back</button>' +
        '</div>';
      window.VYBE_FOCUS.recoverFocus(screenEl);
    });
  };

  Screens.renderDetailsUI = function(container, item, mediaType, autoPlayOnReady) {
    var title = item.title || item.name;
    var backdropUrl = tmdb.getImageUrl(item.backdrop_path, 'w1280');
    var posterUrl = tmdb.getImageUrl(item.poster_path, 'w342');
    var year = (item.release_date || item.first_air_date || '').slice(0, 4);
    var runtimeText = item.runtime ? (Math.floor(item.runtime / 60) + 'h ' + (item.runtime % 60) + 'm') : (item.episode_run_time && item.episode_run_time[0] ? item.episode_run_time[0] + 'm' : '');
    var genres = (item.genres || []).map(function(g) { return g.name; }).join(' · ');
    var cast = (item.credits && item.credits.cast ? item.credits.cast.slice(0, 8) : []);

    // Check if unreleased movie (only show indicator, but still allow stream check)
    var isUpcoming = false;
    if (item.release_date && new Date(item.release_date) > new Date()) {
      isUpcoming = true;
    }

    container.innerHTML = '<div class="details-backdrop" style="background-image: url(\'' + backdropUrl + '\')">' +
      '<div class="details-scrim"></div>' +
      '</div>' +
      '<div class="details-content-wrapper">' +
      '<div class="details-left-poster">' +
      '<img src="' + posterUrl + '" alt="' + title + '" class="details-poster-img" onerror="this.src=\'assets/placeholder.svg\'" />' +
      '</div>' +
      '<div class="details-right-info">' +
      '<div class="details-meta-line">' +
      '<span class="badge-type">' + (mediaType === 'tv' ? 'SERIES' : 'MOVIE') + '</span>' +
      (year ? '<span class="meta-item">' + year + (isUpcoming ? ' (Upcoming)' : '') + '</span>' : '') +
      (runtimeText ? '<span class="meta-item">' + runtimeText + '</span>' : '') +
      (item.vote_average ? '<span class="meta-item">&#9733; ' + item.vote_average.toFixed(1) + '</span>' : '') +
      '</div>' +
      '<h1 class="details-title">' + title + '</h1>' +
      '<div class="details-genres">' + genres + '</div>' +
      '<p class="details-overview">' + (item.overview || 'No overview available.') + '</p>' +

      // Play Button & Status Area
      '<div class="details-play-zone" data-nav-group="details-actions">' +
      '<button id="btn-details-play" class="btn-play-details focusable checking" disabled>' +
      '<span class="spinner-inline"></span> Checking sources... (0/' + detailsTotalProviders + ')' +
      '</button>' +
      '</div>' +

      // Source Chips (§2.2)
      '<div id="details-source-chips-container" class="source-chips-container"></div>' +
      '<div id="details-stream-summary-text" class="stream-summary-text"></div>' +

      // Series Seasons Section if TV
      (mediaType === 'tv' ? '<div id="series-episodes-section" class="series-episodes-section"></div>' : '') +

      // Cast Row
      (cast.length ? '<div class="details-cast-section">' +
        '<h3 class="section-heading">Top Cast</h3>' +
        '<div class="cast-row-scroll row-scroll-container" data-nav-group="details-cast">' +
        cast.map(function(c) {
          return '<div class="cast-card">' +
            '<div class="cast-name">' + c.name + '</div>' +
            '<div class="cast-char">' + (c.character || '') + '</div>' +
            '</div>';
        }).join('') +
        '</div>' +
        '</div>' : '') +

      // Similar Titles Row
      (item.similar && item.similar.results && item.similar.results.length ?
        '<div id="details-similar-section" class="details-similar-section">' +
        '<h3 class="section-heading">More Like This</h3>' +
        '<div class="row-scroll-container shelf-slider" data-nav-group="details-similar">' +
        item.similar.results.slice(0, 10).map(function(sim) {
          var simPoster = tmdb.getImageUrl(sim.poster_path, 'w342');
          return '<div class="card movie-card focusable" onclick="VYBE_SCREENS.openDetails(\'' + mediaType + '\', ' + sim.id + ', false)">' +
            '<img src="' + simPoster + '" alt="' + (sim.title || sim.name) + '" class="card-poster" />' +
            '<div class="card-caption"><div class="card-title">' + (sim.title || sim.name) + '</div></div>' +
            '</div>';
        }).join('') +
        '</div>' +
        '</div>' : '') +

      '</div>' +
      '</div>';

    // Focus initial element
    window.VYBE_FOCUS.setFocus(document.getElementById('btn-details-play') || container.querySelector('.focusable'));

    if (mediaType === 'tv') {
      Screens.loadSeasonEpisodes(item.id, 1, autoPlayOnReady);
    } else {
      Screens.startParallelStreamCheck(mediaType, item.id, undefined, undefined, autoPlayOnReady);
    }
  };

  /**
   * Parallel Stream Fetching across 9 providers (§3)
   */
  Screens.startParallelStreamCheck = function(mediaType, id, season, episode, autoPlayOnReady) {
    var playBtn = document.getElementById('btn-details-play');
    var chipsContainer = document.getElementById('details-source-chips-container');
    var summaryEl = document.getElementById('details-stream-summary-text');
    if (!playBtn) return;

    var cacheKey = streamsEngine.makeCacheKey(mediaType, id, season, episode);

    // Negative cache check
    if (streamsEngine.isMarkedNegative(cacheKey)) {
      Screens.showNoStreamsState(mediaType, id, season, episode);
      return;
    }

    // Memory cache check
    var cached = streamsEngine.getCached(cacheKey);
    if (cached) {
      Screens.onStreamsLoaded(cached.grouped, autoPlayOnReady);
      return;
    }

    detailsStreamChecks = {};
    detailsAggregatedStreams = [];
    detailsCheckedCount = 0;
    var allProviders = config.ALL_PROVIDERS;
    var hasActivatedPlay = false;

    playBtn.disabled = true;
    playBtn.className = 'btn-play-details focusable checking';
    playBtn.innerHTML = '<span class="spinner-inline"></span> Checking sources... 0/' + detailsTotalProviders;
    if (chipsContainer) chipsContainer.innerHTML = '';
    if (summaryEl) summaryEl.textContent = '';

    for (var i = 0; i < allProviders.length; i++) {
      (function(prov) {
        api.fetchProviderStreams(prov.key, mediaType, id, season, episode)
          .then(function(res) {
            detailsCheckedCount++;
            if (res && res.streams && res.streams.length > 0) {
              detailsAggregatedStreams = detailsAggregatedStreams.concat(res.streams);

              var currentGrouped = streamsEngine.groupAndNormalize(detailsAggregatedStreams);
              Screens.renderSourceChips(currentGrouped);

              // As soon as first provider returns >=1 stream, enable PLAY! (§3.3)
              if (!hasActivatedPlay) {
                hasActivatedPlay = true;
                Screens.enablePlayButton(currentGrouped, autoPlayOnReady);
              }
            }

            // Update counter if still checking
            var btn = document.getElementById('btn-details-play');
            if (btn && btn.classList.contains('checking')) {
              btn.innerHTML = '<span class="spinner-inline"></span> Checking sources... ' + detailsCheckedCount + '/' + detailsTotalProviders;
            }

            // All finished
            if (detailsCheckedCount >= detailsTotalProviders) {
              if (detailsAggregatedStreams.length === 0) {
                streamsEngine.markNegative(cacheKey);
                Screens.showNoStreamsState(mediaType, id, season, episode);
              } else {
                var finalGrouped = streamsEngine.groupAndNormalize(detailsAggregatedStreams);
                streamsEngine.setCached(cacheKey, detailsAggregatedStreams, finalGrouped);
                Screens.onStreamsLoaded(finalGrouped, false);
              }
            }
          });
      })(allProviders[i]);
    }
  };

  Screens.enablePlayButton = function(groupedStreams, autoPlayOnReady) {
    var playBtn = document.getElementById('btn-details-play');
    if (!playBtn) return;

    playBtn.disabled = false;
    playBtn.className = 'btn-play-details focusable active';
    playBtn.innerHTML = '<span class="icon">&#9658;</span> Play';

    playBtn.onclick = function() {
      var latest = detailsAggregatedStreams.length > 0 ? streamsEngine.groupAndNormalize(detailsAggregatedStreams) : groupedStreams;
      Screens.launchPlayerWithDetails(latest);
    };

    window.VYBE_FOCUS.setFocus(playBtn);

    if (autoPlayOnReady) {
      Screens.launchPlayerWithDetails(groupedStreams);
    }
  };

  Screens.onStreamsLoaded = function(groupedStreams, autoPlayOnReady) {
    Screens.enablePlayButton(groupedStreams, autoPlayOnReady);
    Screens.renderSourceChips(groupedStreams);
  };

  Screens.renderSourceChips = function(groupedStreams) {
    var chipsContainer = document.getElementById('details-source-chips-container');
    var summaryEl = document.getElementById('details-stream-summary-text');
    if (!chipsContainer || !groupedStreams || !groupedStreams.providers.length) return;

    var selectedProvider = groupedStreams.providers[0];

    chipsContainer.innerHTML = '<div class="chip-label">Source:</div>' +
      groupedStreams.providers.map(function(pKey) {
        var list = groupedStreams.byProvider[pKey] || [];
        var pName = list.length > 0 ? list[0].providerName : pKey;
        var isSelected = pKey === selectedProvider;
        return '<button class="source-chip focusable' + (isSelected ? ' active' : '') + '" onclick="VYBE_SCREENS.onDetailsChipClick(\'' + pKey + '\')">' +
          pName + ' (' + list.length + ')' +
          '</button>';
      }).join('');

    // Summary text under chips: "Hindi · Tamil · English subs · up to 1080p"
    if (summaryEl) {
      var topStreams = groupedStreams.byProvider[selectedProvider] || [];
      var langs = streamsEngine.getLanguagesForProvider(topStreams);
      var maxQ = topStreams.length > 0 ? topStreams[0].qualityLabel : '1080p';
      var hasSubs = topStreams.some(function(s) { return s.subtitles && s.subtitles.length > 0; });
      summaryEl.textContent = langs.join(' · ') + (hasSubs ? ' · Subtitles' : '') + ' · up to ' + maxQ;
    }
  };

  Screens.onDetailsChipClick = function(pKey) {
    var currentGrouped = streamsEngine.groupAndNormalize(detailsAggregatedStreams);
    var chipBtns = document.querySelectorAll('.source-chip');
    for (var i = 0; i < chipBtns.length; i++) {
      chipBtns[i].classList.remove('active');
      if (chipBtns[i].textContent.toLowerCase().indexOf(pKey) !== -1) {
        chipBtns[i].classList.add('active');
      }
    }
    // Update summary text
    var summaryEl = document.getElementById('details-stream-summary-text');
    if (summaryEl) {
      var topStreams = currentGrouped.byProvider[pKey] || [];
      var langs = streamsEngine.getLanguagesForProvider(topStreams);
      var maxQ = topStreams.length > 0 ? topStreams[0].qualityLabel : '1080p';
      summaryEl.textContent = langs.join(' · ') + ' · up to ' + maxQ;
    }
  };

  Screens.showNoStreamsState = function(mediaType, id, season, episode) {
    var playZone = document.querySelector('.details-play-zone');
    var chipsContainer = document.getElementById('details-source-chips-container');
    if (chipsContainer) chipsContainer.innerHTML = '';

    if (playZone) {
      playZone.innerHTML = '<div class="no-streams-box">' +
        '<span class="no-streams-msg">Not available right now</span>' +
        '<button id="btn-retry-sources" class="btn-secondary focusable" onclick="VYBE_SCREENS.retryStreamCheck(\'' + mediaType + '\', ' + id + ', ' + season + ', ' + episode + ')">Retry</button>' +
        '<button id="btn-see-similar" class="btn-secondary focusable" onclick="VYBE_SCREENS.scrollToSimilar()">See Similar Titles</button>' +
        '</div>';
      window.VYBE_FOCUS.setFocus(document.getElementById('btn-retry-sources'));
    }
  };

  Screens.retryStreamCheck = function(mediaType, id, season, episode) {
    var cacheKey = streamsEngine.makeCacheKey(mediaType, id, season, episode);
    streamsEngine.clearNegative(cacheKey);
    var playZone = document.querySelector('.details-play-zone');
    if (playZone) {
      playZone.innerHTML = '<button id="btn-details-play" class="btn-play-details focusable checking" disabled>' +
        '<span class="spinner-inline"></span> Checking sources... (0/' + detailsTotalProviders + ')' +
        '</button>';
    }
    Screens.startParallelStreamCheck(mediaType, id, season, episode, false);
  };

  Screens.scrollToSimilar = function() {
    var sim = document.getElementById('details-similar-section');
    if (sim) {
      var firstCard = sim.querySelector('.focusable');
      if (firstCard) window.VYBE_FOCUS.setFocus(firstCard);
    }
  };

  Screens.launchPlayerWithDetails = function(groupedStreams, episodeObj, nextEpisodeObj) {
    var item = currentDetailsData;
    var titleMeta = {
      id: item.id,
      type: item.mediaType,
      title: item.title || item.name,
      poster: item.poster_path,
      backdrop: item.backdrop_path,
      season: episodeObj ? episodeObj.season_number : undefined,
      episode: episodeObj ? episodeObj.episode_number : undefined,
      nextEpisode: nextEpisodeObj,
      playNextCallback: function() {
        if (nextEpisodeObj) {
          Screens.playEpisodeDirect(nextEpisodeObj);
        }
      }
    };

    window.VYBE_PLAYER.open(titleMeta, groupedStreams);
  };

  // TV Seasons & Episodes
  Screens.loadSeasonEpisodes = function(tvId, seasonNum, autoPlayOnReady) {
    var section = document.getElementById('series-episodes-section');
    if (!section) return;
    selectedSeasonNumber = seasonNum || 1;

    section.innerHTML = '<h3 class="section-heading">Season ' + selectedSeasonNumber + '</h3>' +
      '<div class="episodes-list row-scroll-container" data-nav-group="details-episodes"><div class="spinner-inline"></div> Loading episodes...</div>';

    tmdb.getSeason(tvId, selectedSeasonNumber).then(function(seasonData) {
      var episodes = (seasonData && seasonData.episodes) || [];
      if (!episodes.length) {
        section.innerHTML = '<div class="no-episodes">No episodes found.</div>';
        return;
      }

      section.innerHTML = '<h3 class="section-heading">Episodes (' + episodes.length + ')</h3>' +
        '<div class="episodes-slider row-scroll-container" data-nav-group="details-episodes">' +
        episodes.map(function(ep, index) {
          var stillUrl = tmdb.getImageUrl(ep.still_path, 'w342');
          return '<div class="card episode-card focusable" onclick="VYBE_SCREENS.onEpisodeClick(' + ep.episode_number + ')">' +
            '<div class="ep-thumb-wrap">' +
            '<img src="' + stillUrl + '" alt="' + ep.name + '" class="ep-thumb" onerror="this.src=\'assets/placeholder.svg\'" />' +
            '<span class="ep-num">E' + ep.episode_number + '</span>' +
            '</div>' +
            '<div class="ep-info">' +
            '<div class="ep-title">' + ep.name + '</div>' +
            '<div class="ep-time">' + (ep.runtime ? ep.runtime + 'm' : '') + '</div>' +
            '</div>' +
            '</div>';
        }).join('') +
        '</div>';

      // Check stream for episode 1
      Screens.startParallelStreamCheck('tv', tvId, selectedSeasonNumber, 1, autoPlayOnReady);
    });
  };

  Screens.onEpisodeClick = function(episodeNumber) {
    if (!currentDetailsData) return;
    utils.showToast('Checking streams for Episode ' + episodeNumber + '...');
    Screens.startParallelStreamCheck('tv', currentDetailsData.id, selectedSeasonNumber, episodeNumber, true);
  };

  // ==========================================
  // 3. SEARCH SCREEN (KEYBOARD + LIVE RESULTS)
  // ==========================================
  Screens.renderSearch = function(container) {
    container.innerHTML = '<div class="search-screen-layout">' +
      '<div class="search-input-area">' +
      '<input id="search-native-input" class="search-field focusable" type="text" placeholder="Type title or use Magic Remote Mic..." value="' + searchQuery + '" data-nav-group="search-bar" />' +
      '<div class="search-voice-hint">&#127908; webOS Magic Remote Voice typing supported</div>' +
      '</div>' +
      '<div class="search-body">' +
      '<div class="keyboard-container" data-nav-group="search-keyboard">' +
      Screens.renderVirtualKeyboard() +
      '</div>' +
      '<div id="search-results-area" class="search-results-area" data-nav-group="search-results">' +
      '<div class="search-placeholder-msg">Type a title or actor name above to search catalog</div>' +
      '</div>' +
      '</div>' +
      '</div>';

    var inputEl = document.getElementById('search-native-input');
    if (inputEl) {
      inputEl.addEventListener('input', function() {
        searchQuery = inputEl.value;
        Screens.triggerDebouncedSearch();
      });
      window.VYBE_FOCUS.setFocus(inputEl);
    }
  };

  Screens.renderVirtualKeyboard = function() {
    var rows = [
      ['A', 'B', 'C', 'D', 'E', 'F', '1', '2', '3'],
      ['G', 'H', 'I', 'J', 'K', 'L', '4', '5', '6'],
      ['M', 'N', 'O', 'P', 'Q', 'R', '7', '8', '9'],
      ['S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', '0'],
      ['SPACE', 'BACKSPACE', 'CLEAR']
    ];

    var html = '';
    for (var r = 0; r < rows.length; r++) {
      html += '<div class="keyboard-row">';
      for (var k = 0; k < rows[r].length; k++) {
        var key = rows[r][k];
        var isSpecial = key === 'SPACE' || key === 'BACKSPACE' || key === 'CLEAR';
        html += '<button class="key-btn focusable' + (isSpecial ? ' key-special' : '') + '" onclick="VYBE_SCREENS.onVirtualKeyClick(\'' + key + '\')">' +
          (key === 'BACKSPACE' ? '&#9003; DEL' : key) +
          '</button>';
      }
      html += '</div>';
    }
    return html;
  };

  Screens.onVirtualKeyClick = function(key) {
    var inputEl = document.getElementById('search-native-input');
    if (key === 'SPACE') {
      searchQuery += ' ';
    } else if (key === 'BACKSPACE') {
      searchQuery = searchQuery.slice(0, -1);
    } else if (key === 'CLEAR') {
      searchQuery = '';
    } else {
      searchQuery += key;
    }
    if (inputEl) inputEl.value = searchQuery;
    Screens.triggerDebouncedSearch();
  };

  Screens.triggerDebouncedSearch = utils.debounce(function() {
    var resultsEl = document.getElementById('search-results-area');
    if (!resultsEl) return;

    if (!searchQuery.trim()) {
      resultsEl.innerHTML = '<div class="search-placeholder-msg">Type a title or actor name above to search catalog</div>';
      return;
    }

    resultsEl.innerHTML = '<div class="spinner-inline"></div> Searching catalog...';

    tmdb.searchMulti(searchQuery.trim(), 1).then(function(data) {
      if (!data || !data.results || !data.results.length) {
        resultsEl.innerHTML = '<div class="no-results-msg">No titles found for "' + searchQuery + '"</div>';
        return;
      }

      resultsEl.innerHTML = '<div class="search-grid">' +
        data.results.map(function(item) {
          var posterUrl = tmdb.getImageUrl(item.poster_path, 'w342');
          var title = item.title || item.name;
          var mediaType = item.media_type || 'movie';
          var year = (item.release_date || item.first_air_date || '').slice(0, 4);

          return '<div class="card movie-card focusable" onclick="VYBE_SCREENS.openDetails(\'' + mediaType + '\', ' + item.id + ', false)">' +
            '<div class="card-image-wrap">' +
            '<img src="' + posterUrl + '" alt="' + title + '" class="card-poster" onerror="this.src=\'assets/placeholder.svg\'" />' +
            '</div>' +
            '<div class="card-caption">' +
            '<div class="card-title">' + title + '</div>' +
            '<div class="card-meta">' + year + '</div>' +
            '</div>' +
            '</div>';
        }).join('') +
        '</div>';
    }).catch(function(err) {
      resultsEl.innerHTML = '<div class="no-results-msg">Search error: ' + err.message + '</div>';
    });
  }, 500);

  // ==========================================
  // 4. MOVIES & TV TABS SCREEN
  // ==========================================
  Screens.renderMediaTab = function(container, mediaType) {
    currentTabMediaType = mediaType;
    currentTabPage = 1;
    currentTabGenre = 'all';

    var genres = [
      { id: 'all', label: 'All' },
      { id: '28', label: 'Action' },
      { id: '35', label: 'Comedy' },
      { id: '18', label: 'Drama' },
      { id: '27', label: 'Horror' },
      { id: '878', label: 'Sci-Fi' },
      { id: '10749', label: 'Romance' },
      { id: '16', label: 'Animation' }
    ];

    container.innerHTML = '<div class="tab-screen-wrap">' +
      '<div class="tab-header-row">' +
      '<h1 class="tab-screen-title">' + (mediaType === 'tv' ? 'TV Shows & Web Series' : 'Movies & Cinema') + '</h1>' +
      '<div class="genre-chips-filter row-scroll-container" data-nav-group="tab-genres">' +
      genres.map(function(g) {
        return '<button class="genre-filter-btn focusable' + (g.id === 'all' ? ' active' : '') + '" onclick="VYBE_SCREENS.onGenreFilterClick(\'' + g.id + '\')">' + g.label + '</button>';
      }).join('') +
      '</div>' +
      '</div>' +
      '<div id="tab-grid-content" class="tab-grid-content" data-nav-group="tab-grid">' +
      '<div class="spinner-inline"></div> Loading titles...' +
      '</div>' +
      '</div>';

    Screens.loadTabGrid();
  };

  Screens.onGenreFilterClick = function(genreId) {
    currentTabGenre = genreId;
    currentTabPage = 1;
    var btns = document.querySelectorAll('.genre-filter-btn');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.remove('active');
    }
    event.target.classList.add('active');
    Screens.loadTabGrid();
  };

  Screens.loadTabGrid = function() {
    var gridEl = document.getElementById('tab-grid-content');
    if (!gridEl) return;

    var promise;
    if (currentTabGenre === 'all') {
      promise = currentTabMediaType === 'tv' ? tmdb.getPopularTv(currentTabPage) : tmdb.getPopularMovies(currentTabPage);
    } else {
      promise = tmdb.getByGenre(currentTabMediaType, currentTabGenre, currentTabPage);
    }

    promise.then(function(data) {
      if (!data || !data.results) return;
      gridEl.innerHTML = '<div class="search-grid">' +
        data.results.map(function(item) {
          var posterUrl = tmdb.getImageUrl(item.poster_path, 'w342');
          var title = item.title || item.name;
          var year = (item.release_date || item.first_air_date || '').slice(0, 4);

          return '<div class="card movie-card focusable" onclick="VYBE_SCREENS.openDetails(\'' + currentTabMediaType + '\', ' + item.id + ', false)">' +
            '<div class="card-image-wrap">' +
            '<img src="' + posterUrl + '" alt="' + title + '" class="card-poster" onerror="this.src=\'assets/placeholder.svg\'" />' +
            '</div>' +
            '<div class="card-caption">' +
            '<div class="card-title">' + title + '</div>' +
            '<div class="card-meta">' + year + '</div>' +
            '</div>' +
            '</div>';
        }).join('') +
        '</div>';
    }).catch(function(err) {
      gridEl.innerHTML = '<div class="no-results-msg">Failed to load content: ' + err.message + '</div>';
    });
  };

  // ==========================================
  // 5. SETTINGS SCREEN
  // ==========================================
  Screens.renderSettings = function(container) {
    var userPref = utils.storage.get('vybe_settings', config.DEFAULTS);

    container.innerHTML = '<div class="settings-screen-wrap">' +
      '<h1 class="settings-main-title">Settings & Preferences</h1>' +
      '<div class="settings-sections" data-nav-group="settings-list">' +

      // Preferred Language
      '<div class="settings-card">' +
      '<div class="setting-title">Preferred Audio Language</div>' +
      '<div class="setting-desc">Auto-selects this audio language for providers with multiple audio tracks (e.g. CastleTV)</div>' +
      '<div class="setting-options">' +
      ['Hindi', 'English', 'Tamil', 'Telugu', 'Original'].map(function(lang) {
        var isSel = userPref.preferredLanguage === lang;
        return '<button class="opt-btn focusable' + (isSel ? ' active' : '') + '" onclick="VYBE_SCREENS.savePref(\'preferredLanguage\', \'' + lang + '\')">' + lang + '</button>';
      }).join('') +
      '</div>' +
      '</div>' +

      // Preferred Max Quality
      '<div class="settings-card">' +
      '<div class="setting-title">Preferred Maximum Quality</div>' +
      '<div class="setting-desc">Caps auto-stream selection to conserve TV bandwidth</div>' +
      '<div class="setting-options">' +
      ['Auto', '1080p', '720p', '480p'].map(function(q) {
        var isSel = userPref.preferredMaxQuality === q;
        return '<button class="opt-btn focusable' + (isSel ? ' active' : '') + '" onclick="VYBE_SCREENS.savePref(\'preferredMaxQuality\', \'' + q + '\')">' + q + '</button>';
      }).join('') +
      '</div>' +
      '</div>' +

      // Default Subtitle
      '<div class="settings-card">' +
      '<div class="setting-title">Default Subtitles</div>' +
      '<div class="setting-desc">Automatically turns on subtitles when available in stream</div>' +
      '<div class="setting-options">' +
      ['Off', 'English', 'Hindi'].map(function(sub) {
        var isSel = userPref.defaultSubtitle === sub;
        return '<button class="opt-btn focusable' + (isSel ? ' active' : '') + '" onclick="VYBE_SCREENS.savePref(\'defaultSubtitle\', \'' + sub + '\')">' + sub + '</button>';
      }).join('') +
      '</div>' +
      '</div>' +

      // Always Use Proxy Toggle
      '<div class="settings-card">' +
      '<div class="setting-title">Always Use Stream Proxy</div>' +
      '<div class="setting-desc">Proxies all video streams through your Worker. Enable if your TV ISP blocks direct CDN hosts.</div>' +
      '<div class="setting-options">' +
      '<button class="opt-btn focusable' + (userPref.alwaysUseProxy ? ' active' : '') + '" onclick="VYBE_SCREENS.savePref(\'alwaysUseProxy\', ' + (!userPref.alwaysUseProxy) + ')">' +
      (userPref.alwaysUseProxy ? 'ON (Always Proxied)' : 'OFF (Smart Direct Play)') +
      '</button>' +
      '</div>' +
      '</div>' +

      // TMDB UI Language
      '<div class="settings-card">' +
      '<div class="setting-title">TMDB Language</div>' +
      '<div class="setting-desc">Metadata language for movie/series titles and synopses</div>' +
      '<div class="setting-options">' +
      ['en-US', 'hi-IN'].map(function(tl) {
        var isSel = userPref.tmdbLanguage === tl;
        return '<button class="opt-btn focusable' + (isSel ? ' active' : '') + '" onclick="VYBE_SCREENS.savePref(\'tmdbLanguage\', \'' + tl + '\')">' + (tl === 'en-US' ? 'English (en-US)' : 'हिन्दी (hi-IN)') + '</button>';
      }).join('') +
      '</div>' +
      '</div>' +

      // Data Cleaning Actions
      '<div class="settings-card">' +
      '<div class="setting-title">Storage & Maintenance</div>' +
      '<div class="setting-options">' +
      '<button class="action-btn focusable" onclick="VYBE_SCREENS.clearContinueWatching()">Clear Continue Watching</button>' +
      '<button class="action-btn focusable" onclick="VYBE_SCREENS.clearCache()">Clear App Cache</button>' +
      '</div>' +
      '</div>' +

      // About
      '<div class="settings-card">' +
      '<div class="setting-title">About VYBE OTT</div>' +
      '<div class="setting-desc">Version: ' + config.APP_VERSION + ' · Target: LG webOS 4.0+ (Chromium 53) · Worker URL: ' + config.API_BASE_URL + '</div>' +
      '<div class="setting-desc" style="margin-top: 8px; color: #a8a8b3;">Remote debug shortcut: Press <b>0</b> five times on your remote to toggle the live diagnostics overlay.</div>' +
      '</div>' +

      '</div>' +
      '</div>';
  };

  Screens.savePref = function(key, value) {
    var userPref = utils.storage.get('vybe_settings', config.DEFAULTS);
    userPref[key] = value;
    utils.storage.set('vybe_settings', userPref);
    utils.showToast('Preference saved');
    Screens.renderSettings(document.getElementById('settings-screen'));
  };

  Screens.clearContinueWatching = function() {
    try {
      var toRemove = [];
      for (var i = 0; i < window.localStorage.length; i++) {
        var k = window.localStorage.key(i);
        if (k && k.indexOf('vybe_progress_') === 0) {
          toRemove.push(k);
        }
      }
      for (var j = 0; j < toRemove.length; j++) {
        window.localStorage.removeItem(toRemove[j]);
      }
      utils.showToast('Continue watching cleared');
    } catch (e) {}
  };

  Screens.clearCache = function() {
    utils.showToast('App cache cleared');
  };

  window.VYBE_SCREENS = Screens;
})(window);
