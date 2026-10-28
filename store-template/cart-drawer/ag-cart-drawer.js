/*
 * AuraGlow cart drawer enhancements (works on top of Dawn's cart-drawer.js / cart.js):
 *  - "Cart reserved" countdown, persisted in sessionStorage, restarts at 00:00
 *  - discount codes applied through the Ajax API (POST /cart/update.js {discount})
 *  - keeps "Your Cart (N)" and the checkout ?discount= fallback in sync after Dawn re-renders
 * Everything uses event delegation / DOM queries, so Dawn replacing the drawer HTML is safe.
 */
(function () {
  'use strict';

  if (window.AgCartDrawer) return;

  var TIMER_KEY = 'ag-cart-reserved-v1';
  var memoryTimer = null;
  var rejectedCodes = {};
  var busy = false;

  /* ---------- helpers ---------- */
  function $(selector) {
    return document.querySelector('#CartDrawer ' + selector) || document.querySelector(selector);
  }

  function cartUrl() {
    return (window.routes && window.routes.cart_url) || '/cart';
  }

  function cartUpdateUrl() {
    return ((window.routes && window.routes.cart_update_url) || '/cart/update') + '.js';
  }

  function sameCode(a, b) {
    return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
  }

  function pad(n) {
    return (n < 10 ? '0' : '') + n;
  }

  /* ---------- reserved timer ---------- */
  function readTimer() {
    try {
      var raw = window.sessionStorage.getItem(TIMER_KEY);
      return raw ? JSON.parse(raw) : memoryTimer;
    } catch (e) {
      return memoryTimer;
    }
  }

  function writeTimer(data) {
    memoryTimer = data;
    try {
      window.sessionStorage.setItem(TIMER_KEY, JSON.stringify(data));
    } catch (e) {
      /* storage blocked: keep in memory */
    }
  }

  function timerEnd(minutes) {
    var now = Date.now();
    var duration = minutes * 60000;
    var data = readTimer();
    if (!data || data.m !== minutes || typeof data.end !== 'number' || data.end <= now || data.end - now > duration) {
      data = { m: minutes, end: now + duration };
      writeTimer(data);
    }
    return data.end;
  }

  function tick() {
    var nodes = document.querySelectorAll('[data-ag-timer]');
    if (!nodes.length) return;
    var minutes = parseInt(nodes[0].getAttribute('data-minutes'), 10);
    if (!(minutes > 0)) minutes = 10;
    var left = Math.max(0, Math.ceil((timerEnd(minutes) - Date.now()) / 1000));
    var text = pad(Math.floor(left / 60)) + ':' + pad(left % 60);
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].textContent !== text) nodes[i].textContent = text;
    }
  }

  /* ---------- sync after any re-render ---------- */
  function appliedCodes() {
    var holder = $('[data-ag-codes]');
    var value = holder ? holder.getAttribute('data-ag-codes') || '' : '';
    return value.split(',').map(function (c) { return c.trim(); }).filter(Boolean);
  }

  function updateCheckoutAction() {
    var button = document.getElementById('CartDrawer-Checkout');
    if (!button) return;
    var codes = appliedCodes();
    var input = $('[data-ag-discount-input]');
    var typed = input ? input.value.trim() : '';
    if (typed && !rejectedCodes[typed.toLowerCase()] && !codes.some(function (c) { return sameCode(c, typed); })) {
      codes.push(typed);
    }
    if (codes.length) {
      var action = cartUrl() + '?discount=' + encodeURIComponent(codes.join(','));
      if (button.getAttribute('formaction') !== action) button.setAttribute('formaction', action);
    } else if (button.hasAttribute('formaction')) {
      button.removeAttribute('formaction');
    }
  }

  function syncCount() {
    var footer = $('[data-ag-item-count]');
    if (!footer) return;
    var count = footer.getAttribute('data-ag-item-count');
    var nodes = document.querySelectorAll('#CartDrawer [data-ag-count]');
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].textContent !== count) nodes[i].textContent = count;
    }
  }

  function sync() {
    tick();
    syncCount();
    updateCheckoutAction();
  }

  var scheduled = false;
  function scheduleSync() {
    if (scheduled) return;
    scheduled = true;
    (window.requestAnimationFrame || window.setTimeout)(function () {
      scheduled = false;
      sync();
    });
  }

  var observer = null;
  var observedRoot = null;
  function observe() {
    var root = document.querySelector('cart-drawer');
    if (!root || root === observedRoot || !window.MutationObserver) return;
    if (observer) observer.disconnect();
    observer = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var target = mutations[i].target;
        if (!(target.closest && target.closest('[data-ag-timer], [data-ag-count]'))) {
          scheduleSync();
          return;
        }
      }
    });
    observer.observe(root, { childList: true, subtree: true });
    observedRoot = root;
  }

  /* ---------- discount codes ---------- */
  function setMessage(text, type) {
    var el = $('[data-ag-discount-msg]');
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('is-error', type === 'error');
    el.classList.toggle('is-success', type === 'success');
  }

  function setBusy(state) {
    var button = $('[data-ag-discount-apply]');
    if (!button) return;
    if (state) {
      button.setAttribute('aria-busy', 'true');
    } else {
      button.removeAttribute('aria-busy');
    }
  }

  function messages() {
    var box = $('[data-ag-discount]');
    return {
      success: (box && box.getAttribute('data-msg-success')) || 'Discount code applied!',
      error: (box && box.getAttribute('data-msg-error')) || "This code isn't valid for your cart."
    };
  }

  function fetchCart() {
    return fetch(cartUrl() + '.js', { credentials: 'same-origin', headers: { Accept: 'application/json' } }).then(
      function (r) {
        return r.json();
      }
    );
  }

  function currentCodes() {
    return fetchCart()
      .then(function (cart) {
        if (cart && Array.isArray(cart.discount_codes)) {
          return cart.discount_codes
            .map(function (d) { return d && d.code; })
            .filter(Boolean);
        }
        return appliedCodes();
      })
      .catch(function () {
        return appliedCodes();
      });
  }

  function postCodes(codes) {
    return fetch(cartUpdateUrl(), {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        discount: codes.join(','),
        sections: ['cart-drawer'],
        sections_url: window.location.pathname
      })
    }).then(function (response) {
      return response
        .json()
        .catch(function () { return null; })
        .then(function (data) {
          if (!response.ok || !data || data.status >= 400) {
            throw new Error((data && (data.description || data.message)) || 'Cart update failed');
          }
          return data;
        });
    });
  }

  /* true = applied, false = rejected / not applicable, null = API gave no information */
  function codeState(cart, code) {
    if (!cart || !Array.isArray(cart.discount_codes)) return null;
    for (var i = 0; i < cart.discount_codes.length; i++) {
      var entry = cart.discount_codes[i];
      if (entry && sameCode(entry.code, code)) return entry.applicable !== false;
    }
    return false;
  }

  function renderDrawer(cart) {
    var html = cart && cart.sections && cart.sections['cart-drawer'];
    var htmlPromise = html
      ? Promise.resolve(html)
      : fetch(cartUrl() + '?section_id=cart-drawer', { credentials: 'same-origin' })
          .then(function (r) { return r.text(); })
          .catch(function () { return null; });

    return htmlPromise.then(function (markup) {
      var current = document.querySelector('#CartDrawer .drawer__inner');
      var next = markup ? new DOMParser().parseFromString(markup, 'text/html').querySelector('.drawer__inner') : null;
      if (!current || !next) {
        window.location.reload();
        return false;
      }
      current.innerHTML = next.innerHTML;
      var drawer = document.querySelector('cart-drawer');
      if (drawer && cart && typeof cart.item_count === 'number') {
        drawer.classList.toggle('is-empty', cart.item_count === 0);
      }
      sync();
      return true;
    });
  }

  function refocus(selector, value) {
    var el = $(selector);
    if (!el) return;
    if (typeof value === 'string' && 'value' in el) el.value = value;
    var container = document.getElementById('CartDrawer');
    if (typeof window.trapFocus === 'function' && container) {
      window.trapFocus(container, el);
    } else {
      el.focus();
    }
  }

  function applyDiscount() {
    if (busy) return;
    var input = $('[data-ag-discount-input]');
    if (!input) return;
    var code = input.value.trim();
    var text = messages();
    if (!code) {
      setMessage(input.getAttribute('placeholder') || text.error, 'error');
      input.focus();
      return;
    }

    busy = true;
    setBusy(true);
    setMessage('', '');
    var existing = [];
    var state = null;

    currentCodes()
      .then(function (codes) {
        existing = codes.filter(function (c) { return !sameCode(c, code); });
        return postCodes(existing.concat([code]));
      })
      .then(function (cart) {
        state = codeState(cart, code);
        if (state === false) {
          // keep the cart clean: drop the code that Shopify refused
          return postCodes(existing).catch(function () { return cart; });
        }
        return cart;
      })
      .then(function (cart) {
        if (state === false) {
          rejectedCodes[code.toLowerCase()] = true;
        } else {
          delete rejectedCodes[code.toLowerCase()];
        }
        return renderDrawer(cart);
      })
      .then(function (rendered) {
        if (!rendered) return;
        if (state === false) {
          refocus('[data-ag-discount-input]', code);
          setMessage(text.error, 'error');
        } else {
          refocus('[data-ag-discount-input]', '');
          setMessage(text.success.replace('[code]', code), 'success');
        }
        updateCheckoutAction();
      })
      .catch(function () {
        setMessage(text.error, 'error');
      })
      .then(function () {
        busy = false;
        setBusy(false);
      });
  }

  function removeDiscount(code) {
    if (busy || !code) return;
    busy = true;
    currentCodes()
      .then(function (codes) {
        return postCodes(codes.filter(function (c) { return !sameCode(c, code); }));
      })
      .then(function (cart) {
        return renderDrawer(cart);
      })
      .then(function (rendered) {
        if (rendered) refocus('[data-ag-discount-input]');
      })
      .catch(function () {
        setMessage(messages().error, 'error');
      })
      .then(function () {
        busy = false;
      });
  }

  /* ---------- events (delegated, survive Dawn re-renders) ---------- */
  document.addEventListener('click', function (event) {
    var target = event.target;
    if (!(target instanceof Element)) return;

    if (target.closest('[data-ag-discount-apply]')) {
      event.preventDefault();
      applyDiscount();
      return;
    }

    var remove = target.closest('[data-ag-discount-remove]');
    if (remove) {
      event.preventDefault();
      removeDiscount(remove.getAttribute('data-ag-discount-remove'));
      return;
    }

    if (target.closest('#CartDrawer-Checkout')) updateCheckoutAction();
  });

  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Enter') return;
    var target = event.target;
    if (target instanceof Element && target.matches('[data-ag-discount-input]')) {
      event.preventDefault();
      applyDiscount();
    }
  });

  document.addEventListener('input', function (event) {
    var target = event.target;
    if (target instanceof Element && target.matches('[data-ag-discount-input]')) {
      setMessage('', '');
      updateCheckoutAction();
    }
  });

  document.addEventListener('shopify:section:load', function () {
    observe();
    sync();
  });

  function init() {
    observe();
    sync();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  window.setInterval(tick, 1000);

  window.AgCartDrawer = {
    sync: sync,
    applyDiscount: applyDiscount,
    removeDiscount: removeDiscount
  };
})();
