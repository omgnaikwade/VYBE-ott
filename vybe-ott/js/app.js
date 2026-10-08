/**
 * VYBE OTT - Main Application Controller
 * Handles boot, scaling, screen stack, sidebar routing, back-key behavior, and remote diagnostics.
 * Strict ES5/ES2015 for LG webOS TV (Chromium 53).
 */
(function(window) {
  'use strict';

  var App = {};
  var utils = window.VYBE_UTILS;
  var focusManager = window.VYBE_FOCUS;
  var screens = window.VYBE_SCREENS;

  var screenStack = ['home-screen'];
  var currentTab = 'home';
  var zeroPressCount = 0;
  var zeroPressTimer = null;

  App.init = function() {
    utils.log('Initializing VYBE OTT...');
    App.setupCanvasScaling();
    window.addEventListener('resize', App.setupCanvasScaling);

    focusManager.init();
    focusManager.registerKeyListener(App.handleGlobalKeys);

    App.setupSidebar();
    App.setupOfflineListener();

    // Start with Splash Screen (1.2 seconds)
    setTimeout(function() {
      var splash = document.getElementById('splash-screen');
      if (splash) {
        splash.classList.add('fade-out');
        setTimeout(function() {
          splash.style.display = 'none';
        }, 500);
      }
      App.switchTab('home');
    }, 1200);
  };

  /**
   * Fixed 1920x1080 canvas scaling for 720p, 1080p, 4K TVs and browser previews
   */
  App.setupCanvasScaling = function() {
    var root = document.getElementById('vybe-root');
    if (!root) return;

    var windowWidth = window.innerWidth || document.documentElement.clientWidth || 1920;
    var windowHeight = window.innerHeight || document.documentElement.clientHeight || 1080;

    var scaleX = windowWidth / 1920;
    var scaleY = windowHeight / 1080;
    var scale = Math.min(scaleX, scaleY);

    root.style.transform = 'scale(' + scale + ')';
    root.style.transformOrigin = 'top left';

    // Center canvas if aspect ratio differs slightly
    var leftOffset = (windowWidth - (1920 * scale)) / 2;
    var topOffset = (windowHeight - (1080 * scale)) / 2;
    root.style.left = leftOffset + 'px';
    root.style.top = topOffset + 'px';
  };

  /**
   * Sidebar Tab Switcher
   */
  App.setupSidebar = function() {
    var sidebarBtns = document.querySelectorAll('.sidebar-nav-btn');
    for (var i = 0; i < sidebarBtns.length; i++) {
      (function(btn) {
        btn.addEventListener('click', function() {
          var tabName = btn.getAttribute('data-tab');
          App.switchTab(tabName);
        });
      })(sidebarBtns[i]);
    }
  };

  App.switchTab = function(tabName) {
    currentTab = tabName;
    screenStack = [tabName + '-screen'];

    // Update sidebar UI
    var navBtns = document.querySelectorAll('.sidebar-nav-btn');
    for (var i = 0; i < navBtns.length; i++) {
      navBtns[i].classList.remove('active');
      if (navBtns[i].getAttribute('data-tab') === tabName) {
        navBtns[i].classList.add('active');
      }
    }

    // Hide all main screens
    var allScreens = document.querySelectorAll('.app-screen');
    for (var s = 0; s < allScreens.length; s++) {
      allScreens[s].classList.add('hidden');
    }

    var targetScreen = document.getElementById(tabName + '-screen');
    if (targetScreen) {
      targetScreen.classList.remove('hidden');

      // Render content dynamically
      if (tabName === 'home') {
        screens.renderHome(targetScreen);
      } else if (tabName === 'search') {
        screens.renderSearch(targetScreen);
      } else if (tabName === 'movies') {
        screens.renderMediaTab(targetScreen, 'movie');
      } else if (tabName === 'tv') {
        screens.renderMediaTab(targetScreen, 'tv');
      } else if (tabName === 'settings') {
        screens.renderSettings(targetScreen);
      }

      // Set focus to primary content or sidebar
      setTimeout(function() {
        var focusable = targetScreen.querySelector('.focusable');
        if (focusable) {
          focusManager.setFocus(focusable);
        } else {
          var activeNav = document.querySelector('.sidebar-nav-btn.active');
          if (activeNav) focusManager.setFocus(activeNav);
        }
      }, 50);
    }
  };

  /**
   * Screen Stack Manager
   */
  App.pushScreen = function(screenId) {
    screenStack.push(screenId);
    var screenEl = document.getElementById(screenId);
    if (screenEl) {
      screenEl.classList.remove('hidden');
    }
  };

  App.popScreen = function() {
    if (screenStack.length <= 1) {
      App.showExitConfirmModal();
      return;
    }

    var currentScreenId = screenStack.pop();
    var screenEl = document.getElementById(currentScreenId);
    if (screenEl) {
      screenEl.classList.add('hidden');
      screenEl.innerHTML = '';
    }

    // Restore previous screen focus
    App.restoreScreenFocus();
  };

  App.restoreScreenFocus = function() {
    var topScreenId = screenStack[screenStack.length - 1];
    var topScreenEl = document.getElementById(topScreenId);
    if (topScreenEl) {
      focusManager.recoverFocus(topScreenEl);
    }
  };

  /**
   * Back Button & Global Key Handling (§3, §4, §8)
   */
  App.handleGlobalKeys = function(keyCode, e) {
    // 1. Diagnostics overlay shortcut: press '0' (key 48) five times
    if (keyCode === 48) {
      zeroPressCount++;
      clearTimeout(zeroPressTimer);
      zeroPressTimer = setTimeout(function() {
        zeroPressCount = 0;
      }, 2000);

      if (zeroPressCount >= 5) {
        zeroPressCount = 0;
        App.toggleDebugOverlay();
        return true;
      }
    }

    // 2. Back button (461 webOS, 8 Backspace, 27 Esc)
    if (keyCode === 461 || keyCode === 8 || keyCode === 27) {
      // If exit modal is open
      var exitModal = document.getElementById('exit-confirm-modal');
      if (exitModal && !exitModal.classList.contains('hidden')) {
        exitModal.classList.add('hidden');
        App.restoreScreenFocus();
        return true;
      }

      // If in Player, player handles it first
      var playerScreen = document.getElementById('player-screen');
      if (playerScreen && !playerScreen.classList.contains('hidden')) {
        return false; // let player key listener handle
      }

      App.popScreen();
      return true;
    }

    return false;
  };

  App.showExitConfirmModal = function() {
    var modal = document.getElementById('exit-confirm-modal');
    if (!modal) return;
    modal.classList.remove('hidden');

    var btnCancel = document.getElementById('btn-exit-cancel');
    var btnConfirm = document.getElementById('btn-exit-confirm');

    btnCancel.onclick = function() {
      modal.classList.add('hidden');
      App.restoreScreenFocus();
    };

    btnConfirm.onclick = function() {
      modal.classList.add('hidden');
      if (window.webOS && window.webOS.platformBack) {
        window.webOS.platformBack();
      } else if (window.close) {
        window.close();
      } else {
        utils.showToast('Exiting VYBE OTT...');
      }
    };

    focusManager.setFocus(btnCancel);
  };

  App.toggleDebugOverlay = function() {
    var overlay = document.getElementById('vybe-debug-overlay');
    if (!overlay) return;
    var isShown = overlay.style.display !== 'none';
    overlay.style.display = isShown ? 'none' : 'block';
    if (!isShown) {
      utils.updateDebugOverlay();
    }
  };

  App.setupOfflineListener = function() {
    var offModal = document.getElementById('offline-modal');
    if (offModal) {
      offModal.classList.add('hidden');
      offModal.style.display = 'none';
    }

    window.addEventListener('offline', function() {
      if (offModal) {
        offModal.classList.remove('hidden');
        offModal.style.display = 'flex';
      }
    });
    window.addEventListener('online', function() {
      if (offModal) {
        offModal.classList.add('hidden');
        offModal.style.display = 'none';
      }
    });
  };

  window.VYBE_APP = App;

  // Boot on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', App.init);
  } else {
    App.init();
  }
})(window);
