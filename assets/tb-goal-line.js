/* tb-goal-line.js: goal line in the top bar (snippets/tb-goal-line.liquid). Display only: it adds no discount, no
   gift and no cart property. The discount comes from the discount codes, the gifts from Kite.

   The sentence speaks only about the discount steps (the BFCM offer: "Add 1 more and get 30% OFF").
   The track carries one plain marker per goal, no values:
   - the discount steps by bottle count, from the section setting ("2:25, 4:30, 6:35, 8:40");
   - the gift app's goals (Kite "TryScent Days": free gifts + free shipping, cart value, this market), marker only,
     never in the sentence. Read like assets/ts-cart-goals.js readGoals: window.gfg.settings, or #kite-app-data
     before Kite empties it. Kite's settings arrive ~1-3 s after load (retry ~12 s) and are kept for the visit
     (sessionStorage), so the next page draws them at once; on a first visit the line waits up to ~4 s for them,
     then shows the steps alone and adds Kite's markers when they arrive.
   Each Kite goal sits on the bottle count where a cart of 50 ml bottles at the step prices reaches it (per-bottle
   selling price from the Choose & Save product, data-ref); a goal on a discount step shares its marker. Markers are
   spaced evenly; the fill follows the bottles; a marker turns red when everything on it is reached (step: bottle
   count, Kite goal: cart total).

   Bottles: every bottle line, any size, 1 each; lines with _bundle_items count the bottles they carry; "5X 100ml"
   boxes count 5; Kite's gift lines (_free_product) never count. First from the page (the cart lines Liquid wrote
   into the line), then /cart.js on every cart update (Dawn pubsub) and on a back/forward cache return.

   Crossing a discount step on a cart update shows "[pct] OFF unlocked" for ~3 s, then the next step. When the
   cart drawer opens over the line (phones, and most desktops), the change waits and plays when the shopper closes
   the drawer. Tapping the line opens the cart drawer, or the cart page where there is no drawer.

   Scrolling back up shows the sticky header again but not the top bar: a copy of the line (makeStrip) hangs under
   the header while it is shown, and hides when the header hides or the page is back at the top. */
(function () {
  if (window.tbGoalReady) return;
  window.tbGoalReady = true;

  var FLASH = 3000;
  var KITE_WAIT = 4000;
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function readGoals(market) {
    var data = window.gfg && window.gfg.settings && window.gfg.settings.consolidatedCombinedDiscount ? window.gfg.settings : null;
    if (!data) {
      var el = document.getElementById('kite-app-data');
      try { data = el && el.textContent ? JSON.parse(el.textContent) : null; } catch (e) { data = null; }
    }
    if (!data) return null;
    var rate = parseFloat(window.Shopify && window.Shopify.currency && window.Shopify.currency.rate) || 1;
    var out = [];
    (data.consolidatedCombinedDiscount || []).forEach(function (c) {
      if (!c || c.isEnabled === false || c.discountFunctionType !== 'CONSOLIDATED_PROGRESS_BAR') return;
      ((c.segmentsData && c.segmentsData.segmentsList) || []).forEach(function (s) {
        var r = ((s.buyXRulesData && s.buyXRulesData.rulesList) || [])[0];
        if (!r || !/subtotal/i.test(r.ruleType || '')) return;
        var rv = r.ruleValue || {};
        var amount = parseFloat(rv.qualifierValue) * rate;
        (rv.marketValues || []).forEach(function (m) {
          if (m && m.handle === market && parseFloat(m.value) > 0) amount = parseFloat(m.value);
        });
        if (amount > 0) out.push({ amount: Math.round(amount * 100) });
      });
    });
    return out.sort(function (a, b) { return a.amount - b.amount; });
  }

  // "2:25, 4:30, 6:35, 8:40" -> [{ n: 2, pct: 25 }, ...], sorted, one per bottle count.
  function parseSteps(text) {
    var seen = {};
    return String(text || '').split(',').map(function (part) {
      var m = /^\s*(\d+)\s*:\s*(\d+(?:[.,]\d+)?)\s*%?\s*$/.exec(part);
      return m ? { n: parseInt(m[1], 10), pct: parseFloat(m[2].replace(',', '.')) } : null;
    }).filter(function (s) {
      if (!s || s.n < 1 || !(s.pct > 0) || seen[s.n]) return false;
      seen[s.n] = true;
      return true;
    }).sort(function (a, b) { return a.n - b.n; });
  }

  function bottlesIn(items) {
    var count = 0;
    (items || []).forEach(function (it) {
      var p = it.properties || {};
      var gift = p._free_product;
      if (gift !== undefined && gift !== null && gift !== '' && String(gift) !== 'false') return;
      var q = Number(it.quantity) || 0;
      if (p._bundle_items) {
        count += String(p._bundle_items).split(',').filter(function (x) { return x.trim(); }).length * q;
        return;
      }
      var text = [it.variant_title, it.product_title, it.title].join(' ');
      var box = /(\d+)\s*[x×]\s*\d+\s*ml/i.exec(text);
      if (box) count += parseInt(box[1], 10) * q;
      else if (/\d\s*ml\b/i.test(text)) count += q;
    });
    return count;
  }

  function init(root) {
    if (root.dataset.started) return;
    root.dataset.started = '1';

    var market = root.dataset.market || '';
    var key = 'tb-goal-' + market;
    var text = root.querySelector('[data-tg-text]');
    var fill = root.querySelector('[data-tg-fill]');
    var marksEl = root.querySelector('[data-tg-marks]');
    var src = function (attr, name) {
      var el = root.querySelector('.tb-goal__src [' + attr + '="' + name + '"]');
      return el ? el.textContent.trim() : '';
    };
    var steps = parseSteps(root.dataset.steps);
    var ref = parseInt(root.dataset.ref, 10) || 0;
    var total = parseInt(root.dataset.total, 10) || 0;
    var items = [];
    try { items = JSON.parse(root.querySelector('[data-tg-items]').textContent); } catch (e) { items = []; }
    var bottles = bottlesIn(items);
    var goals = null;
    var marks = [];
    var reachedSteps = null;
    var flashing = false;
    var flashTimer = 0;
    var painted = false;
    var lineKey = '';

    function pct(value) { return String(Math.round(value * 10) / 10) + '%'; }
    function bottleWord(n) { return n + ' ' + src('data-tg-word', n === 1 ? 'one' : 'many'); }
    function capital(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

    function pctAt(b) {
      var out = 0;
      steps.forEach(function (s) { if (b >= s.n) out = s.pct; });
      return out;
    }

    // Bottle count where a cart of 50 ml bottles at the step prices reaches a Kite amount.
    function bottlesFor(amount) {
      if (!ref) return null;
      for (var n = 1; n <= 40; n++) if (n * ref * (1 - pctAt(n) / 100) >= amount) return n;
      return null;
    }

    function build() {
      var at = {};
      steps.forEach(function (s) { at[s.n] = { at: s.n, step: s, goals: [] }; });
      (goals || []).forEach(function (g) {
        var n = bottlesFor(g.amount);
        if (n === null) return;
        (at[n] = at[n] || { at: n, step: null, goals: [] }).goals.push(g);
      });
      marks = Object.keys(at).map(function (k) { return at[k]; }).sort(function (a, b) { return a.at - b.at; });
      marksEl.textContent = '';
      marks.forEach(function (m, i) {
        var el = document.createElement('span');
        el.className = 'tb-goal__mark';
        el.style.setProperty('--p', String((i + 1) / marks.length));
        m.el = el;
        marksEl.appendChild(el);
      });
    }

    function fillPercent() {
      if (!marks.length || !bottles) return 0;
      var prev = 0;
      for (var i = 0; i < marks.length; i++) {
        var at = marks[i].at;
        if (bottles < at) return ((i + (bottles - prev) / (at - prev)) / marks.length) * 100;
        prev = at;
      }
      return 100;
    }

    // The sentence: the next discount step, or the top discount once every step is reached.
    // { template, values } so the numbers can stand out: [pct] red and bold, [n] bold.
    function message() {
      var next = null;
      for (var i = 0; i < steps.length; i++) if (bottles < steps[i].n) { next = steps[i]; break; }
      if (!next) return { done: true, next: null, template: src('data-tg-msg', 'done'), values: { pct: pct(steps.length ? steps[steps.length - 1].pct : 0) } };
      var name = bottles === 0 ? 'empty' : 'step';
      return { done: false, next: next, template: src('data-tg-msg', name), values: { n: bottleWord(next.n - bottles), pct: pct(next.pct) } };
    }

    // Writes a template with its [n] / [pct] parts as their own elements (built as nodes, never as HTML).
    function writeLine(template, values) {
      var keyNow = template + '|' + (values.n || '') + '|' + (values.pct || '');
      if (keyNow === lineKey) return;
      lineKey = keyNow;
      text.textContent = '';
      template.split(/(\[n\]|\[pct\])/).forEach(function (part, i) {
        if (!part) return;
        var token = /^\[(n|pct)\]$/.exec(part);
        if (!token) {
          text.appendChild(document.createTextNode(i === 0 ? capital(part) : part));
          return;
        }
        var b = document.createElement('b');
        b.className = token[1] === 'pct' ? 'tb-goal__hot' : 'tb-goal__num';
        b.textContent = values[token[1]] || '';
        text.appendChild(b);
      });
    }

    // The cart drawer opens on an add. Where it covers the line (phones, and the right-hand countdown half on most
    // desktops), a change that arrives while it is open waits and plays when the shopper closes it and sees the line
    // again. Where the line stays in view beside the drawer, it updates at once and matches the cart beside it.
    var drawer = document.querySelector('cart-drawer');
    var drawerCovers = function () {
      if (!drawer || !drawer.classList.contains('active')) return false;
      var panel = drawer.querySelector('.drawer__inner') || drawer;
      var width = panel.offsetWidth;
      var a = root.querySelector('.tb-goal__icon').getBoundingClientRect();
      var b = root.querySelector('.tb-goal__body').getBoundingClientRect();
      var middle = (a.left + b.right) / 2;
      return width > 0 && middle >= document.documentElement.clientWidth - width;
    };
    var waiting = false;
    if (drawer) {
      new MutationObserver(function () {
        if (waiting && !drawerCovers()) {
          waiting = false;
          render(true);
        }
      }).observe(drawer, { attributes: true, attributeFilter: ['class'] });
    }

    function render(animate) {
      if (goals === null) return;
      if (animate && drawerCovers()) {
        waiting = true;
        return;
      }
      // The fill sweeps in from empty on the first draw (two frames, so the transition has a start), then follows.
      var to = fillPercent();
      var width = to >= 100 ? '100%' : to <= 0 ? '0px' : 'calc(' + to / 100 + ' * (100% - 12px) + 6px)';
      if (!painted && !reduceMotion && to > 0) {
        requestAnimationFrame(function () { requestAnimationFrame(function () { fill.style.width = width; }); });
      } else {
        fill.style.width = width;
      }
      painted = true;

      var msg = message();
      root.classList.toggle('is-done', msg.done);

      // Markers: reached (red, check), the next discount step's marker pulses, a marker reached by this cart
      // update pops with a ring burst.
      marks.forEach(function (m) {
        var on = !m.step || bottles >= m.step.n;
        m.goals.forEach(function (g) { if (total < g.amount) on = false; });
        var was = m.el.classList.contains('is-reached');
        m.el.classList.toggle('is-reached', on);
        m.el.classList.toggle('is-next', !!(msg.next && m.step === msg.next));
        if (animate && on && !was && !reduceMotion) {
          m.el.classList.remove('is-pop');
          void m.el.offsetWidth;
          m.el.classList.add('is-pop');
          setTimeout(function () { m.el.classList.remove('is-pop'); }, 800);
        }
      });

      // Discount steps reached now; a step newly crossed by this cart update is announced first.
      var now = steps.filter(function (s) { return bottles >= s.n; });
      var fresh = animate && reachedSteps ? now.filter(function (s) { return reachedSteps.indexOf(s.n) < 0; }) : [];
      reachedSteps = now.map(function (s) { return s.n; });

      if (fresh.length && !reduceMotion) {
        var top = fresh[fresh.length - 1];
        flashing = true;
        root.classList.remove('is-flash');
        void text.offsetWidth;
        root.classList.add('is-flash');
        writeLine(src('data-tg-msg', 'unlocked').replace('[rewards]', src('data-tg-label', 'pct')), { pct: pct(top.pct) });
        clearTimeout(flashTimer);
        flashTimer = setTimeout(function () {
          flashing = false;
          root.classList.remove('is-flash');
          render(false);
        }, FLASH);
        return;
      }
      if (flashing) return;
      writeLine(msg.template, msg.values);
    }

    function applyCart(cart, animate) {
      if (!cart || typeof cart.total_price !== 'number' || !cart.items) return;
      total = cart.total_price;
      bottles = bottlesIn(cart.items);
      render(animate);
    }

    function refreshCart(animate) {
      var base = (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || '/';
      fetch(base + 'cart.js', { headers: { Accept: 'application/json' } })
        .then(function (r) { return r.json(); })
        .then(function (c) { applyCart(c, animate); })
        .catch(function () {});
    }

    function setGoals(list, save) {
      if (goals && JSON.stringify(goals) === JSON.stringify(list)) return;
      goals = list;
      if (save) {
        try { sessionStorage.setItem(key, JSON.stringify(list)); } catch (e) {}
      }
      build();
      render(false);
      root.classList.add('is-ready');
    }

    // Kite's settings: retry ~12 s. Without a saved copy the line waits up to ~4 s, then shows the steps alone.
    function findGoals(tries) {
      var list = readGoals(market);
      if (list) return setGoals(list, true);
      if (tries * 500 >= KITE_WAIT && goals === null) setGoals([], false);
      if (tries < 24) setTimeout(function () { findGoals(tries + 1); }, 500);
    }

    function openCart(event) {
      event.preventDefault();
      event.stopPropagation();
      var d = document.querySelector('cart-drawer');
      if (d && typeof d.open === 'function' && !/\/cart\/?$/.test(location.pathname)) d.open(root);
      else window.location.href = root.dataset.cartUrl || '/cart';
    }

    // The line sits inside the bar's link: a click here opens the cart and never follows that link
    // (middle click included).
    root.addEventListener('click', openCart);
    root.addEventListener('auxclick', function (event) { event.preventDefault(); event.stopPropagation(); });
    root.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ') openCart(event);
    });

    var saved = null;
    try { saved = JSON.parse(sessionStorage.getItem(key) || 'null'); } catch (e) {}
    if (Array.isArray(saved)) setGoals(saved, false);
    findGoals(0);

    if (typeof subscribe === 'function' && typeof PUB_SUB_EVENTS !== 'undefined') {
      subscribe(PUB_SUB_EVENTS.cartUpdate, function (e) {
        if (!root.isConnected) return;
        // The drawer publishes the whole cart; an add publishes only the added line, so fetch the cart then.
        if (e && e.cartData && typeof e.cartData.total_price === 'number' && e.cartData.items) applyCart(e.cartData, true);
        else refreshCart(true);
      });
    }
    window.addEventListener('pageshow', function (e) { if (e.persisted) refreshCart(false); });

    if (!root.hasAttribute('data-tg-sticky')) makeStrip(root);
  }

  // Scrolling back up brings the header back, while the top bar stays scrolled away. A copy of the line hangs
  // under the header while it is shown again (tb-goal-line.css). It takes no room, so nothing on the page moves;
  // --tg-strip-h lets the collection filter bar sit under it.
  function makeStrip(root) {
    var header = document.querySelector('.section-header');
    if (!header || !header.querySelector('sticky-header') || header.querySelector('.tb-goal-strip')) return;
    var strip = document.createElement('div');
    strip.className = 'tb-goal-strip';
    strip.setAttribute('style', root.getAttribute('style') || '');
    var copy = root.cloneNode(true);
    copy.removeAttribute('data-started');
    copy.setAttribute('data-tg-sticky', '');
    copy.classList.remove('is-ready', 'is-flash', 'is-done');
    var copyText = copy.querySelector('[data-tg-text]');
    if (copyText) {
      copyText.textContent = '';
      copyText.removeAttribute('aria-live');
    }
    var copyFill = copy.querySelector('[data-tg-fill]');
    if (copyFill) copyFill.removeAttribute('style');
    var copyMarks = copy.querySelector('[data-tg-marks]');
    if (copyMarks) copyMarks.innerHTML = '';
    strip.appendChild(copy);
    header.appendChild(strip);

    var doc = document.documentElement;
    doc.classList.add('tg-has-strip');
    var setHeight = function () { doc.style.setProperty('--tg-strip-h', strip.offsetHeight + 'px'); };
    setHeight();
    if ('ResizeObserver' in window) new ResizeObserver(setHeight).observe(strip);
    init(copy);
  }

  function startAll() { document.querySelectorAll('[data-tb-goal]').forEach(init); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startAll);
  else startAll();
  document.addEventListener('shopify:section:load', startAll);
})();
