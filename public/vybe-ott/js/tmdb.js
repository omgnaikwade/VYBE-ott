/**
 * VYBE OTT - TMDB Integration (via Cloudflare Worker passthrough)
 * Requests pass through: GET /api/tmdb/<path>?<params>
 * Strict ES5/ES2015 Promises.
 */
(function(window) {
  'use strict';

  var Tmdb = {};
  var config = window.VYBE_CONFIG;
  var utils = window.VYBE_UTILS;

  // TMDB Image helper
  Tmdb.getImageUrl = function(path, size) {
    if (!path) {
      return 'assets/placeholder.svg';
    }
    var targetSize = size || 'w342';
    return config.TMDB_IMAGE_BASE + targetSize + path;
  };

  // Base TMDB proxy request
  Tmdb.call = function(endpoint, queryParams) {
    var settings = utils.storage.get('vybe_settings', config.DEFAULTS);
    var lang = (settings && settings.tmdbLanguage) || 'en-US';

    var params = Object.assign({}, queryParams || {});
    if (!params.language) {
      params.language = lang;
    }

    var qs = [];
    var keys = Object.keys(params);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (params[k] !== undefined && params[k] !== null) {
        qs.push(encodeURIComponent(k) + '=' + encodeURIComponent(params[k]));
      }
    }

    var cleanEndpoint = endpoint.indexOf('/') === 0 ? endpoint.slice(1) : endpoint;
    var fullPath = '/api/tmdb/' + cleanEndpoint + (qs.length > 0 ? '?' + qs.join('&') : '');

    return window.VYBE_API.get(fullPath);
  };

  // Home Screen Feeds
  Tmdb.getTrendingAll = function() {
    return Tmdb.call('trending/all/week');
  };

  Tmdb.getPopularMovies = function(page) {
    return Tmdb.call('movie/popular', { page: page || 1 });
  };

  Tmdb.getTopRatedMovies = function(page) {
    return Tmdb.call('movie/top_rated', { page: page || 1 });
  };

  Tmdb.getNowPlayingMovies = function(page) {
    return Tmdb.call('movie/now_playing', { page: page || 1 });
  };

  Tmdb.getPopularTv = function(page) {
    return Tmdb.call('tv/popular', { page: page || 1 });
  };

  Tmdb.getTopRatedTv = function(page) {
    return Tmdb.call('tv/top_rated', { page: page || 1 });
  };

  Tmdb.getOnTheAirTv = function(page) {
    return Tmdb.call('tv/on_the_air', { page: page || 1 });
  };

  // Indian Regional Rows
  Tmdb.getIndianLanguageMovies = function(langCode, page) {
    return Tmdb.call('discover/movie', {
      with_original_language: langCode,
      sort_by: 'popularity.desc',
      region: 'IN',
      page: page || 1
    });
  };

  Tmdb.getIndianLanguageTv = function(langCode, page) {
    return Tmdb.call('discover/tv', {
      with_original_language: langCode,
      sort_by: 'popularity.desc',
      page: page || 1
    });
  };

  // Genre Rows
  Tmdb.getByGenre = function(mediaType, genreId, page) {
    var endpoint = mediaType === 'tv' ? 'discover/tv' : 'discover/movie';
    return Tmdb.call(endpoint, {
      with_genres: genreId,
      sort_by: 'popularity.desc',
      page: page || 1
    });
  };

  // Search
  Tmdb.searchMulti = function(query, page) {
    return Tmdb.call('search/multi', {
      query: query,
      include_adult: false,
      page: page || 1
    }).then(function(data) {
      if (data && data.results) {
        // Filter out "person", keep only movie and tv
        data.results = data.results.filter(function(item) {
          return item.media_type === 'movie' || item.media_type === 'tv';
        });
      }
      return data;
    });
  };

  // Details
  Tmdb.getDetails = function(mediaType, id) {
    var endpoint = (mediaType === 'tv' ? 'tv' : 'movie') + '/' + id;
    return Tmdb.call(endpoint, {
      append_to_response: 'credits,videos,similar'
    });
  };

  // Series Season Episodes
  Tmdb.getSeason = function(tvId, seasonNumber) {
    return Tmdb.call('tv/' + tvId + '/season/' + seasonNumber);
  };

  window.VYBE_TMDB = Tmdb;
})(window);
