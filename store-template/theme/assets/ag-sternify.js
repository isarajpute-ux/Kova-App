(function () {
  if (window.__agSternify) return;
  window.__agSternify = true;

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function money(cents, fmt) {
    fmt = (fmt || '${{amount}}').replace(/<[^>]*>/g, '');
    cents = Math.round(Number(cents) || 0);
    function d(n, p, t, dec) {
      var x = (n / 100).toFixed(p).split('.');
      x[0] = x[0].replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1' + t);
      return x[1] ? x[0] + dec + x[1] : x[0];
    }
    var m = fmt.match(/\{\{\s*(\w+)\s*\}\}/);
    var v;
    switch (m ? m[1] : 'amount') {
      case 'amount_no_decimals': v = d(cents, 0, ',', '.'); break;
      case 'amount_with_comma_separator': v = d(cents, 2, '.', ','); break;
      case 'amount_no_decimals_with_comma_separator': v = d(cents, 0, '.', ','); break;
      case 'amount_with_apostrophe_separator': v = d(cents, 2, "'", '.'); break;
      default: v = d(cents, 2, ',', '.');
    }
    return fmt.replace(/\{\{\s*\w+\s*\}\}/, v);
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function store(kind) {
    try { var s = window[kind]; var k = '__ag'; s.setItem(k, k); s.removeItem(k); return s; } catch (e) { return null; }
  }
  var LS = store('localStorage');
  var SS = store('sessionStorage');

  function dealEnd(hours) {
    var now = Date.now(), d = new Date(), day = d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
    var end = LS ? parseInt(LS.getItem('agDealEnd'), 10) : NaN;
    var sday = LS ? LS.getItem('agDealDay') : null;
    if (!end || isNaN(end) || sday !== day || end <= now) {
      end = now + hours * 3600000;
      if (LS) { LS.setItem('agDealEnd', String(end)); LS.setItem('agDealDay', day); }
    }
    return end;
  }

  /* ---------- copy buttons ---------- */
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-ag-copy]');
    if (!b) return;
    var code = b.getAttribute('data-ag-copy');
    var done = function () {
      var lbl = $('[data-copy-label]', b) || b;
      var old = lbl.getAttribute('data-orig') || lbl.textContent;
      lbl.setAttribute('data-orig', old);
      lbl.textContent = b.getAttribute('data-copied') || 'Copied!';
      b.classList.add('is-copied');
      clearTimeout(b.__t);
      b.__t = setTimeout(function () { lbl.textContent = old; b.classList.remove('is-copied'); }, 1600);
    };
    var legacy = function () {
      var t = document.createElement('textarea');
      t.value = code; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
      document.body.appendChild(t); t.select();
      try { document.execCommand('copy'); } catch (err) {}
      document.body.removeChild(t);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).catch(legacy);
    } else {
      legacy();
    }
    done();
  });

  /* ---------- animated <details> ---------- */
  document.addEventListener('click', function (e) {
    var sum = e.target.closest('details[data-ag-acc] > summary');
    if (!sum || reduceMotion) return;
    var det = sum.parentElement;
    var body = sum.nextElementSibling;
    if (!body || !body.animate) return;
    e.preventDefault();
    if (det.__anim) det.__anim.cancel();
    if (det.open) {
      var h = body.offsetHeight;
      det.classList.add('is-closing');
      det.__anim = body.animate([{ height: h + 'px', opacity: 1 }, { height: '0px', opacity: 0 }], { duration: 260, easing: 'ease' });
      det.__anim.onfinish = function () { det.open = false; det.classList.remove('is-closing'); det.__anim = null; };
    } else {
      det.open = true;
      var h2 = body.offsetHeight;
      det.__anim = body.animate([{ height: '0px', opacity: 0 }, { height: h2 + 'px', opacity: 1 }], { duration: 300, easing: 'ease' });
      det.__anim.onfinish = function () { det.__anim = null; };
    }
  });

  /* ---------- top countdown bar ---------- */
  function initTop(root) {
    if (root.__ag) return; root.__ag = true;
    var key = 'agTop_' + (root.getAttribute('data-key') || '');
    if (root.getAttribute('data-dismiss') === 'true' && SS && SS.getItem(key + '_closed') === '1') root.classList.add('is-closed');
    var x = $('[data-top-close]', root);
    if (x) x.addEventListener('click', function () { root.classList.add('is-closed'); if (SS) SS.setItem(key + '_closed', '1'); });
    var mode = root.getAttribute('data-mode');
    var hours = parseFloat(root.getAttribute('data-hours')) || 5;
    var end;
    function newEnd() { end = dealEnd(hours); }
    if (mode === 'date') {
      end = new Date(root.getAttribute('data-end')).getTime();
      if (isNaN(end)) { mode = 'evergreen'; }
    }
    if (mode !== 'date') newEnd();
    var units = { d: $('[data-u="d"]', root), h: $('[data-u="h"]', root), m: $('[data-u="m"]', root), s: $('[data-u="s"]', root) };
    function set(el, v) {
      if (!el || el.textContent === v) return;
      el.textContent = v;
      el.classList.remove('is-tick'); void el.offsetWidth; el.classList.add('is-tick');
    }
    function tick() {
      var left = end - Date.now();
      if (left <= 0) { if (mode === 'date') left = 0; else { newEnd(); left = end - Date.now(); } }
      var t = Math.floor(left / 1000);
      var dd = Math.floor(t / 86400), hh = Math.floor(t % 86400 / 3600), mm = Math.floor(t % 3600 / 60), ss = t % 60;
      if (!units.d) hh += dd * 24;
      set(units.d, pad(dd)); set(units.h, pad(hh)); set(units.m, pad(mm)); set(units.s, pad(ss));
    }
    tick(); setInterval(tick, 1000);
  }

  /* ---------- product ---------- */
  function initProduct(root) {
    if (root.__ag) return; root.__ag = true;
    var fmt = root.getAttribute('data-money-format');
    var soldOut = root.getAttribute('data-sold-out') || 'Sold out';
    var showCmpSetting = root.getAttribute('data-show-compare') === 'true';
    var state = {
      price: parseInt(root.getAttribute('data-price'), 10) || 0,
      compare: parseInt(root.getAttribute('data-compare'), 10) || 0,
      available: root.getAttribute('data-available') === 'true'
    };

    // gallery
    var track = $('[data-ag-track]', root);
    var slides = $$('.agP__slide', root);
    var thumbs = $$('[data-ag-thumb]', root);
    var thumbTrack = $('[data-ag-thumbs]', root);
    var prev = $('[data-ag-prev]', root), next = $('[data-ag-next]', root);
    var idx = 0;
    function syncUI() {
      thumbs.forEach(function (t, k) { t.classList.toggle('is-active', k === idx); });
      var a = thumbs[idx];
      if (a && thumbTrack) thumbTrack.scrollTo({ left: a.offsetLeft - thumbTrack.clientWidth / 2 + a.clientWidth / 2, behavior: 'smooth' });
      if (prev) prev.classList.toggle('is-hidden', idx === 0);
      if (next) next.classList.toggle('is-hidden', idx === slides.length - 1);
    }
    function go(i) {
      if (!track || !slides.length) return;
      idx = Math.max(0, Math.min(slides.length - 1, i));
      track.scrollTo({ left: idx * track.clientWidth, behavior: reduceMotion ? 'auto' : 'smooth' });
      syncUI();
    }
    if (track) {
      var st;
      track.addEventListener('scroll', function () {
        clearTimeout(st);
        st = setTimeout(function () {
          var i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
          if (i !== idx) { idx = i; syncUI(); }
        }, 80);
      }, { passive: true });
    }
    if (prev) prev.addEventListener('click', function () { go(idx - 1); });
    if (next) next.addEventListener('click', function () { go(idx + 1); });
    thumbs.forEach(function (t) { t.addEventListener('click', function () { go(parseInt(t.getAttribute('data-ag-thumb'), 10)); }); });
    var tp = $('[data-ag-tprev]', root), tn = $('[data-ag-tnext]', root);
    if (tp && thumbTrack) tp.addEventListener('click', function () { thumbTrack.scrollBy({ left: -thumbTrack.clientWidth * 0.8, behavior: 'smooth' }); });
    if (tn && thumbTrack) tn.addEventListener('click', function () { thumbTrack.scrollBy({ left: thumbTrack.clientWidth * 0.8, behavior: 'smooth' }); });
    syncUI();

    // form refs
    var idInput = $('[data-ag-id]', root);
    var qtyInput = $('[data-ag-qty]', root);
    var atc = $('[data-ag-atc]', root);
    var atcLabel = $('[data-ag-atc-label]', root);
    var atcHTML = atcLabel ? atcLabel.innerHTML : '';
    var bundles = $$('[data-ag-bundle]', root);

    function activeBundle() { return bundles.filter(function (b) { return b.classList.contains('is-active'); })[0]; }

    function render() {
      var unit = state.price;
      var cmp = state.compare > unit ? state.compare : 0;
      $$('[data-ag-price]', root).forEach(function (el) { el.textContent = money(unit, fmt); });
      var ce = $('[data-ag-compare]', root), oe = $('[data-ag-off]', root);
      if (ce && oe) {
        var on = showCmpSetting && !!cmp;
        if (cmp) { ce.textContent = money(cmp, fmt); oe.textContent = '-' + Math.round((cmp - unit) / cmp * 100) + '%'; }
        ce.hidden = !on; oe.hidden = !on;
      }
      bundles.forEach(function (b) {
        var q = parseInt(b.getAttribute('data-qty'), 10) || 1;
        var save = parseFloat(b.getAttribute('data-save')) || 0;
        var total = Math.round(unit * q * (100 - save) / 100);
        var base = (cmp || unit) * q;
        var pe = $('[data-ag-bprice]', b), se = $('[data-ag-bcompare]', b);
        if (pe) pe.textContent = money(total, fmt);
        if (se) { se.textContent = money(base, fmt); se.hidden = !(base > total); }
      });
      var ab = activeBundle();
      var q2 = ab ? parseInt(ab.getAttribute('data-qty'), 10) || 1 : 1;
      var s2 = ab ? parseFloat(ab.getAttribute('data-save')) || 0 : 0;
      if (qtyInput) qtyInput.value = q2;
      var totalNow = Math.round(unit * q2 * (100 - s2) / 100);
      if (atcLabel) {
        if (state.available) {
          if (atcLabel.__sold) { atcLabel.innerHTML = atcHTML; atcLabel.__sold = false; }
          $$('[data-ag-atc-price]', root).forEach(function (el) { el.textContent = money(totalNow, fmt); });
        } else {
          atcLabel.textContent = soldOut; atcLabel.__sold = true;
        }
      } else {
        $$('[data-ag-atc-price]', root).forEach(function (el) { el.textContent = money(totalNow, fmt); });
      }
      if (atc) atc.disabled = !state.available;
    }

    // variants
    var pills = $$('[data-ag-variant]', root);
    pills.forEach(function (p) {
      p.addEventListener('click', function () {
        if (p.disabled) return;
        pills.forEach(function (x) { var on = x === p; x.classList.toggle('is-active', on); x.setAttribute('aria-checked', on ? 'true' : 'false'); });
        if (idInput) idInput.value = p.getAttribute('data-ag-variant');
        state.price = parseInt(p.getAttribute('data-price'), 10) || 0;
        state.compare = parseInt(p.getAttribute('data-compare'), 10) || 0;
        state.available = p.getAttribute('data-available') === 'true';
        var lbl = $('[data-ag-vlabel]', root);
        if (lbl) lbl.textContent = p.getAttribute('data-title');
        var mi = p.getAttribute('data-media');
        if (mi !== null && mi !== '') go(parseInt(mi, 10));
        try {
          var u = new URL(window.location.href);
          u.searchParams.set('variant', p.getAttribute('data-ag-variant'));
          window.history.replaceState({}, '', u.toString());
        } catch (e) {}
        render();
      });
    });

    // bundles
    bundles.forEach(function (b) {
      var inp = $('input', b);
      var pick = function () {
        bundles.forEach(function (x) { x.classList.toggle('is-active', x === b); });
        if (inp) inp.checked = true;
        render();
      };
      if (inp) inp.addEventListener('change', pick);
      b.addEventListener('click', function (e) { if (e.target !== inp) pick(); });
    });
    if (bundles.length && !activeBundle()) bundles[0].classList.add('is-active');
    render();

    // mini review slider
    $$('[data-ag-mr]', root).forEach(function (mr) {
      var tr = $('[data-mr-track]', mr);
      var n = tr ? tr.children.length : 0;
      if (!tr || n < 2) { $$('.agMR__nav', mr).forEach(function (b) { b.style.display = 'none'; }); return; }
      var i = 0, timer = null;
      var show = function (k) { i = (k + n) % n; tr.style.transform = 'translateX(' + (-100 * i) + '%)'; };
      var auto = mr.getAttribute('data-autoplay') === 'true' && !reduceMotion;
      var speed = (parseFloat(mr.getAttribute('data-speed')) || 5) * 1000;
      var start = function () { if (auto) { clearInterval(timer); timer = setInterval(function () { show(i + 1); }, speed); } };
      var stop = function () { clearInterval(timer); };
      $('[data-mr-prev]', mr).addEventListener('click', function () { show(i - 1); start(); });
      $('[data-mr-next]', mr).addEventListener('click', function () { show(i + 1); start(); });
      mr.addEventListener('mouseenter', stop); mr.addEventListener('mouseleave', start);
      var x0 = null;
      mr.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; stop(); }, { passive: true });
      mr.addEventListener('touchend', function (e) {
        if (x0 === null) return;
        var dx = e.changedTouches[0].clientX - x0; x0 = null;
        if (Math.abs(dx) > 35) show(i + (dx < 0 ? 1 : -1));
        start();
      }, { passive: true });
      start();
    });


    // deal countdown (5h per visitor, resets daily)
    $$('[data-ag-deal]', root).forEach(function (box) {
      var hrs = parseFloat(box.getAttribute('data-hours')) || 5;
      var clk = $('[data-deal-clock]', box);
      var e = dealEnd(hrs);
      var upd = function () {
        var l = e - Date.now();
        if (l <= 0) { e = dealEnd(hrs); l = e - Date.now(); }
        var t = Math.floor(l / 1000);
        if (clk) clk.textContent = pad(Math.floor(t / 3600)) + ':' + pad(Math.floor(t % 3600 / 60)) + ':' + pad(t % 60);
      };
      upd(); setInterval(upd, 1000);
    });

    // delivery estimate
    $$('[data-ag-eta]', root).forEach(function (el) {
      var g = function (a) { return parseInt(el.getAttribute(a), 10) || 0; };
      var style = el.getAttribute('data-style') === 'long' ? 'long' : 'short';
      var fmtD = function (dt) { try { return dt.toLocaleDateString('en-US', { month: style, day: 'numeric' }); } catch (e) { return dt.toDateString(); } };
      var addDays = function (base, n) { var d = new Date(base); d.setDate(d.getDate() + n); return d; };
      var left = $('[data-eta-left]', el), sh = $('[data-eta-ship]', el), de = $('[data-eta-del]', el);
      function upd() {
        var now = new Date();
        var cut = new Date(now); cut.setHours(g('data-cutoff'), 59, 59, 0);
        var base = new Date(now);
        if (now > cut) { cut.setDate(cut.getDate() + 1); base.setDate(base.getDate() + 1); }
        var ms = cut - now;
        var h = Math.floor(ms / 3600000), m = Math.floor(ms % 3600000 / 60000);
        if (left) left.textContent = pad(h) + 'h : ' + pad(m) + 'm';
        if (sh) sh.textContent = fmtD(addDays(base, g('data-ship-min'))) + ' – ' + fmtD(addDays(base, g('data-ship-max')));
        if (de) de.textContent = fmtD(addDays(base, g('data-del-min'))) + ' – ' + fmtD(addDays(base, g('data-del-max')));
      }
      upd(); setInterval(upd, 30000);
    });

    // sticky bar (mobile)
    var sticky = $('[data-ag-sticky]', root);
    if (sticky && atc && 'IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (ents) {
        ents.forEach(function (en) {
          var past = !en.isIntersecting && en.boundingClientRect.top < 0;
          sticky.classList.toggle('is-on', past);
          sticky.setAttribute('aria-hidden', past ? 'false' : 'true');
          var sb = $('[data-ag-sticky-btn]', sticky);
          if (sb) sb.tabIndex = past ? 0 : -1;
        });
      });
      io.observe(atc);
      var sbtn = $('[data-ag-sticky-btn]', sticky);
      if (sbtn) sbtn.addEventListener('click', function () {
        var form = atc.form;
        if (form && form.requestSubmit && state.available) form.requestSubmit(atc);
        else atc.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }
  }

  /* ---------- tabs ---------- */
  function initTabs(root) {
    if (root.__ag) return; root.__ag = true;
    var tabs = $$('[data-tab]', root), panels = $$('[data-panel]', root);
    var i = 0;
    var show = function (k) {
      i = (k + tabs.length) % tabs.length;
      tabs.forEach(function (t, n) { t.classList.toggle('is-active', n === i); t.setAttribute('aria-selected', n === i ? 'true' : 'false'); });
      panels.forEach(function (p, n) { p.classList.toggle('is-active', n === i); });
    };
    tabs.forEach(function (t, n) { t.addEventListener('click', function () { show(n); }); });
    var p = $('[data-tab-prev]', root), nx = $('[data-tab-next]', root);
    if (p) p.addEventListener('click', function () { show(i - 1); });
    if (nx) nx.addEventListener('click', function () { show(i + 1); });
    var x0 = null, stage = $('.agT__stage', root);
    if (stage) {
      stage.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
      stage.addEventListener('touchend', function (e) {
        if (x0 === null) return;
        var dx = e.changedTouches[0].clientX - x0; x0 = null;
        if (Math.abs(dx) > 45) show(i + (dx < 0 ? 1 : -1));
      }, { passive: true });
    }
  }

  /* ---------- before / after ---------- */
  function initBA(frame) {
    if (frame.__ag) return; frame.__ag = true;
    var handle = $('[data-ba-handle]', frame);
    var pos = parseFloat(frame.getAttribute('data-start')) || 50;
    var set = function (v) {
      pos = Math.max(0, Math.min(100, v));
      frame.style.setProperty('--pos', pos + '%');
      if (handle) handle.setAttribute('aria-valuenow', Math.round(pos));
    };
    set(pos);
    var drag = false, sx = 0, sy = 0, decided = false;
    var fromX = function (x) { var r = frame.getBoundingClientRect(); return (x - r.left) / r.width * 100; };
    frame.addEventListener('pointerdown', function (e) {
      drag = true; decided = e.pointerType === 'mouse'; sx = e.clientX; sy = e.clientY;
      if (decided) { frame.classList.add('is-drag'); set(fromX(e.clientX)); try { frame.setPointerCapture(e.pointerId); } catch (er) {} }
    });
    frame.addEventListener('pointermove', function (e) {
      if (!drag) return;
      if (!decided) {
        var dx = Math.abs(e.clientX - sx), dy = Math.abs(e.clientY - sy);
        if (dx < 6 && dy < 6) return;
        if (dy > dx) { drag = false; return; }
        decided = true; frame.classList.add('is-drag');
        try { frame.setPointerCapture(e.pointerId); } catch (er) {}
      }
      set(fromX(e.clientX));
    });
    var end = function () { drag = false; frame.classList.remove('is-drag'); };
    frame.addEventListener('pointerup', end);
    frame.addEventListener('pointercancel', end);
    if (handle) handle.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { set(pos - 5); e.preventDefault(); }
      if (e.key === 'ArrowRight') { set(pos + 5); e.preventDefault(); }
    });
    if (frame.getAttribute('data-hint') === 'true' && !reduceMotion && 'IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (ents) {
        if (!ents[0].isIntersecting) return;
        io.disconnect();
        var start = pos, t0 = null;
        var keys = [[0, start], [0.35, start - 18], [0.7, start + 14], [1, start]];
        var step = function (ts) {
          if (drag) return;
          if (!t0) t0 = ts;
          var p = Math.min(1, (ts - t0) / 1600);
          for (var k = 1; k < keys.length; k++) {
            if (p <= keys[k][0]) {
              var a = keys[k - 1], b = keys[k], f = (p - a[0]) / (b[0] - a[0]);
              f = f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2;
              set(a[1] + (b[1] - a[1]) * f); break;
            }
          }
          if (p < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }, { threshold: 0.5 });
      io.observe(frame);
    }
  }

  /* ---------- videos: play in view, tap for sound ---------- */
  function initVideos(scope) {
    $$('video.agVid', scope).forEach(function (v) {
      if (v.__ag) return; v.__ag = true;
      v.muted = true; v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.removeAttribute('controls');
      var card = v.closest('[data-ag-vcard]') || v.parentElement;
      card.addEventListener('click', function (e) {
        if (e.target.closest('a')) return;
        var unmute = v.muted;
        $$('video.agVid').forEach(function (o) { if (o !== v) { o.muted = true; var c = o.closest('[data-ag-vcard]'); if (c) c.classList.remove('is-sound'); } });
        v.muted = !unmute; card.classList.toggle('is-sound', unmute);
        var pr = v.play(); if (pr && pr.catch) pr.catch(function () {});
      });
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(function (ents) {
          ents.forEach(function (en) {
            if (en.isIntersecting) { var pr = v.play(); if (pr && pr.catch) pr.catch(function () {}); }
            else { v.pause(); }
          });
        }, { threshold: 0.3 }).observe(v);
      }
    });
    $$('[data-ag-vw]', scope).forEach(function (w) {
      if (w.__ag) return; w.__ag = true;
      var tr = $('.agVW__track', w);
      var step = function (d) { var c = $('.agVW__card', tr); tr.scrollBy({ left: d * ((c ? c.offsetWidth : 240) + 16) * 2, behavior: 'smooth' }); };
      var p = $('[data-vw-prev]', w), n = $('[data-vw-next]', w);
      if (p) p.addEventListener('click', function () { step(-1); });
      if (n) n.addEventListener('click', function () { step(1); });
    });
  }

  function initAll(scope) {
    scope = scope || document;
    $$('[data-ag-top]', scope).forEach(initTop);
    $$('[data-ag-product]', scope).forEach(initProduct);
    $$('[data-ag-tabs]', scope).forEach(initTabs);
    $$('[data-ag-ba]', scope).forEach(initBA);
    initVideos(scope);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { initAll(); });
  else initAll();
  document.addEventListener('shopify:section:load', function (e) { initAll(e.target); });
  window.AGSternify = { init: initAll, money: money };
})();
