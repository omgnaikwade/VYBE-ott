/**
 * VYBE OTT - Spatial Navigation & Focus Manager
 * Designed specifically for LG webOS TV (Magic Remote D-pad + Pointer).
 * Chromium 53 compatible (no :focus-visible, pure class-based .focused state).
 */
(function(window) {
  'use strict';

  var Focus = {};
  var utils = window.VYBE_UTILS;

  var currentFocusedEl = null;
  var rowMemory = {}; // Row ID -> Last focused element
  var lastEnterTime = 0;
  var keyListeners = [];
  var isNavigating = true;

  Focus.init = function() {
    document.addEventListener('keydown', Focus.handleKeyDown, true);

    // Magic remote pointer support
    document.addEventListener('mouseover', function(e) {
      var target = e.target;
      while (target && target !== document.body) {
        if (target.classList && target.classList.contains('focusable')) {
          Focus.setFocus(target, true);
          break;
        }
        target = target.parentElement;
      }
    }, true);
  };

  Focus.setFocus = function(element, preventScroll) {
    if (!element || element === currentFocusedEl) return;

    if (currentFocusedEl) {
      currentFocusedEl.classList.remove('focused');
      if (typeof currentFocusedEl.onblur === 'function') {
        currentFocusedEl.onblur();
      }
    }

    currentFocusedEl = element;
    currentFocusedEl.classList.add('focused');
    currentFocusedEl.focus();

    // Remember last focused in this row/group
    var rowGroup = element.getAttribute('data-nav-group') || (element.parentElement && element.parentElement.getAttribute('data-nav-group'));
    if (rowGroup) {
      rowMemory[rowGroup] = element;
    }

    // Auto scroll container into view
    if (!preventScroll) {
      Focus.scrollIntoViewIfNeeded(element);
    }

    // Trigger focus callback if any
    var onFocusFn = element.getAttribute('data-onfocus');
    if (onFocusFn && window[onFocusFn]) {
      window[onFocusFn](element);
    }
  };

  Focus.getCurrent = function() {
    return currentFocusedEl;
  };

  Focus.scrollIntoViewIfNeeded = function(el) {
    if (!el) return;
    // TV 10-foot UI horizontal row scrolling
    var row = el.closest('.row-scroll-container') || el.closest('.shelf-slider');
    if (row) {
      var elLeft = el.offsetLeft;
      var elWidth = el.offsetWidth;
      var rowWidth = row.offsetWidth;
      var targetScroll = elLeft - (rowWidth / 2) + (elWidth / 2);
      if (targetScroll < 0) targetScroll = 0;
      row.scrollTo ? row.scrollTo({ left: targetScroll, behavior: 'smooth' }) : (row.scrollLeft = targetScroll);
    }

    // Vertical page scrolling
    var page = el.closest('.screen-content') || el.closest('.screen');
    if (page) {
      var elTop = el.offsetTop;
      var pageHeight = page.offsetHeight;
      if (elTop > pageHeight * 0.6) {
        var vTarget = elTop - (pageHeight * 0.35);
        page.scrollTo ? page.scrollTo({ top: vTarget, behavior: 'smooth' }) : (page.scrollTop = vTarget);
      } else if (elTop < page.scrollTop) {
        page.scrollTo ? page.scrollTo({ top: 0, behavior: 'smooth' }) : (page.scrollTop = 0);
      }
    }
  };

  Focus.getAllFocusable = function(container) {
    var root = container || document;
    var candidates = root.querySelectorAll('.focusable:not([disabled]):not(.hidden)');
    var visibleList = [];
    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i];
      if (el.offsetParent !== null && window.getComputedStyle(el).display !== 'none' && window.getComputedStyle(el).visibility !== 'hidden') {
        visibleList.push(el);
      }
    }
    return visibleList;
  };

  /**
   * Spatial 2D navigation finding best candidate in given direction
   */
  Focus.move = function(direction) {
    if (!currentFocusedEl) {
      Focus.recoverFocus();
      return;
    }

    // Modal trap: if a modal/panel is open, only navigate inside it
    var activeModal = document.querySelector('.modal-open, .panel-open, .player-settings-drawer.open, .search-active');
    var scope = activeModal || document;

    var candidates = Focus.getAllFocusable(scope);
    if (!candidates.length) return;

    // Check explicit navigation attributes first (data-nav-up, etc.)
    var explicitAttr = 'data-nav-' + direction;
    var explicitTargetId = currentFocusedEl.getAttribute(explicitAttr);
    if (explicitTargetId) {
      var explicitEl = document.getElementById(explicitTargetId);
      if (explicitEl && explicitEl.offsetParent !== null) {
        Focus.setFocus(explicitEl);
        return;
      }
    }

    // Check row memory when moving vertical (Up/Down)
    var currentGroup = currentFocusedEl.getAttribute('data-nav-group');
    var curRect = currentFocusedEl.getBoundingClientRect();
    var curCenterX = curRect.left + curRect.width / 2;
    var curCenterY = curRect.top + curRect.height / 2;

    var bestCandidate = null;
    var minDistance = Infinity;

    for (var i = 0; i < candidates.length; i++) {
      var cand = candidates[i];
      if (cand === currentFocusedEl) continue;

      var r = cand.getBoundingClientRect();
      var cX = r.left + r.width / 2;
      var cY = r.top + r.height / 2;
      var dX = cX - curCenterX;
      var dY = cY - curCenterY;

      var isValidDirection = false;
      var distance = Infinity;

      if (direction === 'right') {
        if (dX > 10) {
          isValidDirection = true;
          // Heavily penalize vertical drift for horizontal moves
          distance = dX + Math.abs(dY) * 3;
        }
      } else if (direction === 'left') {
        if (dX < -10) {
          isValidDirection = true;
          distance = Math.abs(dX) + Math.abs(dY) * 3;
        }
      } else if (direction === 'down') {
        if (dY > 10) {
          isValidDirection = true;
          // Prioritize last remembered item in that target group
          var candGroup = cand.getAttribute('data-nav-group');
          var isMemoryTarget = candGroup && rowMemory[candGroup] === cand;
          distance = dY * 1.5 + Math.abs(dX) + (isMemoryTarget ? -300 : 0);
        }
      } else if (direction === 'up') {
        if (dY < -10) {
          isValidDirection = true;
          var candGroupUp = cand.getAttribute('data-nav-group');
          var isMemoryTargetUp = candGroupUp && rowMemory[candGroupUp] === cand;
          distance = Math.abs(dY) * 1.5 + Math.abs(dX) + (isMemoryTargetUp ? -300 : 0);
        }
      }

      if (isValidDirection && distance < minDistance) {
        minDistance = distance;
        bestCandidate = cand;
      }
    }

    if (bestCandidate) {
      Focus.setFocus(bestCandidate);
    }
  };

  Focus.recoverFocus = function(container) {
    var list = Focus.getAllFocusable(container || document);
    if (list.length > 0) {
      Focus.setFocus(list[0]);
    }
  };

  Focus.handleKeyDown = function(e) {
    var keyCode = e.keyCode || e.which;

    // Prevent default scrolling for arrow keys
    if (keyCode >= 37 && keyCode <= 40) {
      e.preventDefault();
    }

    // Notify registered key listeners (screens, player, app)
    for (var k = 0; k < keyListeners.length; k++) {
      var handled = keyListeners[k](keyCode, e);
      if (handled) {
        e.preventDefault();
        return;
      }
    }

    // Directional keys
    if (keyCode === 37) { // Left
      Focus.move('left');
    } else if (keyCode === 38) { // Up
      Focus.move('up');
    } else if (keyCode === 39) { // Right
      Focus.move('right');
    } else if (keyCode === 40) { // Down
      Focus.move('down');
    } else if (keyCode === 13) { // Enter / OK
      e.preventDefault();
      var now = Date.now();
      // 300ms debounce on Enter to prevent double activations
      if (now - lastEnterTime < 300) return;
      lastEnterTime = now;

      if (currentFocusedEl) {
        currentFocusedEl.click();
      }
    }
  };

  Focus.registerKeyListener = function(listener) {
    keyListeners.push(listener);
  };

  Focus.unregisterKeyListener = function(listener) {
    var idx = keyListeners.indexOf(listener);
    if (idx !== -1) {
      keyListeners.splice(idx, 1);
    }
  };

  window.VYBE_FOCUS = Focus;
})(window);
