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

    return window.VYBE_API.get(fullPath).catch(function(err) {
      utils.log('TMDB API call failed for ' + endpoint + ':', err.message);
      if (config.USE_DEMO_FALLBACK_IF_OFFLINE) {
        return Tmdb.getMockData(cleanEndpoint, params);
      }
      throw err;
    });
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

  // Curated fallback data for demo / offline preview
  Tmdb.getMockData = function(endpoint, params) {
    var sampleMovies = [
      {
        id: 872585,
        media_type: 'movie',
        title: 'Oppenheimer',
        name: 'Oppenheimer',
        overview: 'The story of J. Robert Oppenheimer’s role in the development of the atomic bomb during World War II.',
        poster_path: '/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg',
        backdrop_path: '/fm6KqXpk3M2HVveHwCrBSSBaO0V.jpg',
        vote_average: 8.2,
        release_date: '2023-07-19',
        runtime: 180,
        original_language: 'en'
      },
      {
        id: 579974,
        media_type: 'movie',
        title: 'RRR (Rise Roar Revolt)',
        name: 'RRR',
        overview: 'A fictional history of two legendary revolutionaries and their journey away from home before they began fighting for their country in the 1920s.',
        poster_path: '/kdP1aK1p12wM7n7w18aC9NfXw9D.jpg',
        backdrop_path: '/7WJALNqri0baR90neugxTa3YPMZ.jpg',
        vote_average: 8.4,
        release_date: '2022-03-24',
        runtime: 187,
        original_language: 'te'
      },
      {
        id: 945729,
        media_type: 'movie',
        title: 'Jawan',
        name: 'Jawan',
        overview: 'A man is driven by a personal vendetta to rectify the wrongs in society, while keeping a promise made years ago.',
        poster_path: '/jYW8umIiTaPVh8w0l9VRRmsi71V.jpg',
        backdrop_path: '/bckxSN9tvuvKy6Fb3bt7vPvh650.jpg',
        vote_average: 7.6,
        release_date: '2023-09-07',
        runtime: 169,
        original_language: 'hi'
      },
      {
        id: 926393,
        media_type: 'movie',
        title: 'Kalki 2898 AD',
        name: 'Kalki 2898 AD',
        overview: 'A modern avatar of Vishnu, a Hindu god, who is believed to have descended to earth to protect the world from evil forces.',
        poster_path: '/2E1x6OHtU0vrH3P2v8FvVnZ1qJp.jpg',
        backdrop_path: '/k24eB7kR25M4lGqE8q9q2pX2b9x.jpg',
        vote_average: 7.8,
        release_date: '2024-06-27',
        runtime: 181,
        original_language: 'te'
      },
      {
        id: 693134,
        media_type: 'movie',
        title: 'Dune: Part Two',
        name: 'Dune: Part Two',
        overview: 'Paul Atreides unites with Chani and the Fremen while seeking revenge against the conspirators who destroyed his family.',
        poster_path: '/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg',
        backdrop_path: '/xOMo8BRK7PfcJv9JCnx7s520DRq.jpg',
        vote_average: 8.3,
        release_date: '2024-02-27',
        runtime: 166,
        original_language: 'en'
      },
      {
        id: 866398,
        media_type: 'tv',
        title: 'The Family Man',
        name: 'The Family Man',
        overview: 'A middle-class man working for a secretive government anti-terror cell struggles to balance family life with high-risk national security duties.',
        poster_path: '/6qEkn5GqO34H0t2qQp1g1K1w9n9.jpg',
        backdrop_path: '/r8h0p1q2r3s4t5u6v7w8x9y0z1a.jpg',
        vote_average: 8.5,
        first_air_date: '2019-09-20',
        original_language: 'hi'
      },
      {
        id: 119051,
        media_type: 'tv',
        title: 'Wednesday',
        name: 'Wednesday',
        overview: 'Wednesday Addams investigates a murder spree while solving a 25-year-old supernatural mystery at Nevermore Academy.',
        poster_path: '/9PFonQ95165agEj92w7a2axOPd6.jpg',
        backdrop_path: '/iHSwvRVsRyxpX7FE7GbviaDvgGZ.jpg',
        vote_average: 8.4,
        first_air_date: '2022-11-23',
        original_language: 'en'
      }
    ];

    if (endpoint.indexOf('season') !== -1) {
      return Promise.resolve({
        season_number: 1,
        episodes: [
          {
            episode_number: 1,
            name: 'Episode 1: The Beginning',
            overview: 'The mission begins with high stakes and surprising discoveries.',
            still_path: '/fm6KqXpk3M2HVveHwCrBSSBaO0V.jpg',
            runtime: 52
          },
          {
            episode_number: 2,
            name: 'Episode 2: Shadows in the Night',
            overview: 'New alliances are formed under pressure.',
            still_path: '/7WJALNqri0baR90neugxTa3YPMZ.jpg',
            runtime: 48
          },
          {
            episode_number: 3,
            name: 'Episode 3: The Turning Point',
            overview: 'A crucial piece of evidence changes the entire course of events.',
            still_path: '/bckxSN9tvuvKy6Fb3bt7vPvh650.jpg',
            runtime: 55
          }
        ]
      });
    }

    if (endpoint.indexOf('credits') !== -1 || endpoint.indexOf('movie/') !== -1 || endpoint.indexOf('tv/') !== -1) {
      var matched = sampleMovies[0];
      return Promise.resolve(Object.assign({}, matched, {
        genres: [{ id: 18, name: 'Drama' }, { id: 36, name: 'History' }, { id: 28, name: 'Action' }],
        credits: {
          cast: [
            { name: 'Cillian Murphy', character: 'J. Robert Oppenheimer' },
            { name: 'Emily Blunt', character: 'Katherine Oppenheimer' },
            { name: 'Matt Damon', character: 'Leslie Groves' },
            { name: 'Robert Downey Jr.', character: 'Lewis Strauss' }
          ]
        },
        similar: { results: sampleMovies.slice(1) }
      }));
    }

    return Promise.resolve({
      page: 1,
      results: sampleMovies,
      total_pages: 1,
      total_results: sampleMovies.length
    });
  };

  window.VYBE_TMDB = Tmdb;
})(window);
