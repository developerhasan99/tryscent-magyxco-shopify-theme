/**
 * Collection filter bar (snippets/mgx-filters.liquid), modelled on theessencevault.co.uk as on
 * magyx.whop.site, on top of the store's own Shopify filters. Port of the tryscent.eu file; added
 * here: price fields (priceValue, and a field being typed in keeps its text across a swap).
 * - Every tick or sort choice applies at once: the form's values become the collection URL, the
 *   grid section is fetched by its section id (Section Rendering API) and #ProductGridContainer,
 *   #MgxFiltersBar and #MgxFiltersDrawer are swapped in, so counts and disabled values follow.
 *   The open dropdown, the open drawer and its accordions survive the swap.
 * - Desktop: one dropdown open at a time, closed by an outside click or Escape, opened leftwards
 *   when it would run past the window.
 * - Phone: the "Filter and sort" pill opens a full-screen drawer (scroll locked) whose Apply
 *   button closes it and returns to the top of the grid.
 * Infinite scroll and the search bar re-arm themselves when #ProductGridContainer changes
 * (assets/collection-grid-loader.js).
 */
(() => {
  if (window.mgxFilters) return;

  const BAR = 'MgxFiltersBar';
  const DRAWER = 'MgxFiltersDrawer';
  const GRID = 'ProductGridContainer';
  const byId = (id) => document.getElementById(id);
  let ctrl = null;

  const closePanels = (except) => {
    const bar = byId(BAR);
    if (!bar) return;
    bar.querySelectorAll('.mgx-fc-dd').forEach((dd) => {
      if (dd === except) return;
      const pill = dd.querySelector('.mgx-fc-pill');
      const panel = dd.querySelector('.mgx-fc-panel');
      if (pill) pill.setAttribute('aria-expanded', 'false');
      if (panel) panel.hidden = true;
      dd.classList.remove('mgx-fc-dd--end');
    });
  };

  const openPanel = (dd) => {
    closePanels(dd);
    const pill = dd.querySelector('.mgx-fc-pill');
    const panel = dd.querySelector('.mgx-fc-panel');
    if (!pill || !panel) return;
    pill.setAttribute('aria-expanded', 'true');
    panel.hidden = false;
    dd.classList.remove('mgx-fc-dd--end');
    if (panel.getBoundingClientRect().right > window.innerWidth - 8) dd.classList.add('mgx-fc-dd--end');
  };

  const openDrawer = () => {
    const drawer = byId(DRAWER);
    if (!drawer) return;
    closePanels();
    drawer.hidden = false;
    document.documentElement.classList.add('mgx-fc-lock');
    const close = drawer.querySelector('.mgx-fc-x');
    if (close) close.focus();
  };

  const closeDrawer = (toGrid) => {
    const drawer = byId(DRAWER);
    if (!drawer || drawer.hidden) return;
    drawer.hidden = true;
    document.documentElement.classList.remove('mgx-fc-lock');
    const bar = byId(BAR);
    const trigger = bar && bar.querySelector('.mgx-fc-trigger');
    if (toGrid && bar) bar.scrollIntoView({ block: 'start' });
    if (trigger) trigger.focus({ preventScroll: true });
  };

  // Price fields (snippets/mgx-filters-price.liquid) show the shop's money format, e.g. "1,234.50"
  // or "1.234,50"; the URL wants 1234.50. A separator followed by one or two final digits is the
  // decimal point, every other separator goes. Anything that is not a number is dropped.
  const priceValue = (raw) => {
    let value = String(raw).replace(/[\s' ]/g, '');
    const decimal = value.match(/[.,](\d{1,2})$/);
    if (decimal) value = value.slice(0, decimal.index).replace(/[.,]/g, '') + '.' + decimal[1];
    else value = value.replace(/[.,]/g, '');
    return /^\d+(\.\d+)?$/.test(value) ? value : '';
  };

  const urlFor = (form) => {
    const bar = byId(BAR);
    const base = (bar && bar.dataset.url) || location.pathname;
    const defaultSort = bar ? bar.dataset.defaultSort : '';
    const params = new URLSearchParams();
    new FormData(form).forEach((value, key) => {
      if (/\.price\.(gte|lte)$/.test(key)) value = priceValue(value);
      if (value === '' || (key === 'sort_by' && value === defaultSort)) return;
      params.append(key, value);
    });
    const query = params.toString();
    return base + (query ? `?${query}` : '');
  };

  // What the shopper had open, so the swap does not close it under their finger.
  const snapshot = () => {
    const bar = byId(BAR);
    const drawer = byId(DRAWER);
    const openDd = bar && bar.querySelector('.mgx-fc-pill[aria-expanded="true"]');
    const body = drawer && drawer.querySelector('.mgx-fc-body');
    const active = document.activeElement;
    return {
      dd: openDd ? openDd.closest('.mgx-fc-dd').dataset.key : null,
      drawer: !!(drawer && !drawer.hidden),
      acc: drawer ? [...drawer.querySelectorAll('.mgx-fc-acc')].map((d) => [d.dataset.key, d.open]) : [],
      scroll: body ? body.scrollTop : 0,
      focus:
        active && active.matches && active.matches('[data-mgx-fc-form] input')
          ? {
              name: active.name,
              value: active.value,
              text: active.type === 'text',
              caret: active.type === 'text' ? active.selectionStart : null,
              inDrawer: !!active.closest('#' + DRAWER),
            }
          : null,
    };
  };

  const restore = (state) => {
    const bar = byId(BAR);
    const drawer = byId(DRAWER);
    if (state.dd && bar) {
      const dd = [...bar.querySelectorAll('.mgx-fc-dd')].find((el) => el.dataset.key === state.dd);
      if (dd) openPanel(dd);
    }
    if (drawer) {
      state.acc.forEach(([key, open]) => {
        const acc = [...drawer.querySelectorAll('.mgx-fc-acc')].find((el) => el.dataset.key === key);
        if (acc) acc.open = open;
      });
      if (state.drawer) {
        drawer.hidden = false;
        document.documentElement.classList.add('mgx-fc-lock');
      }
      const body = drawer.querySelector('.mgx-fc-body');
      if (body) body.scrollTop = state.scroll;
    }
    if (state.focus) {
      const scope = state.focus.inDrawer ? drawer : bar;
      // A price field is found by name and gets back what the shopper is still typing there.
      const input =
        scope &&
        [...scope.querySelectorAll('[data-mgx-fc-form] input')].find(
          (el) => el.name === state.focus.name && (state.focus.text || el.value === state.focus.value)
        );
      if (input) {
        input.focus({ preventScroll: true });
        if (state.focus.text) {
          input.value = state.focus.value;
          if (state.focus.caret != null) input.setSelectionRange(state.focus.caret, state.focus.caret);
        }
      }
    }
  };

  const swap = (doc, id, inner) => {
    const current = byId(id);
    const fresh = doc.getElementById(id);
    if (!current || !fresh) return;
    if (inner) current.innerHTML = fresh.innerHTML;
    else current.replaceWith(fresh);
  };

  const go = (url) => {
    const bar = byId(BAR);
    const grid = byId(GRID);
    if (!bar || !grid) {
      location.assign(url);
      return;
    }
    if (ctrl) ctrl.abort();
    ctrl = new AbortController();
    const mine = ctrl;
    grid.setAttribute('aria-busy', 'true');
    const fetchUrl = url + (url.includes('?') ? '&' : '?') + 'section_id=' + encodeURIComponent(bar.dataset.sectionId);
    fetch(fetchUrl, { signal: mine.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((html) => {
        if (mine !== ctrl) return;
        const doc = new DOMParser().parseFromString(html, 'text/html');
        // Taken now, not when the request started: the shopper may have moved on to the next
        // field or typed more while it was loading.
        const state = snapshot();
        if (!doc.getElementById(GRID) || !doc.getElementById(BAR)) throw new Error('section markup missing');
        // The grid's inner content only: the loader and the search watch this container.
        swap(doc, GRID, true);
        // The bar is replaced whole (its data-url and default sort travel with it); the drawer
        // keeps its element so an open drawer stays open.
        swap(doc, BAR, false);
        swap(doc, DRAWER, true);
        history.replaceState(history.state, '', url);
        restore(state);
        document.dispatchEvent(new CustomEvent('mgx:filters:render', { detail: { url } }));
      })
      .catch((error) => {
        if (error.name === 'AbortError') return;
        console.error('Collection filters: could not update the grid', error);
        location.assign(url);
      })
      .finally(() => {
        if (mine !== ctrl) return;
        const current = byId(GRID);
        if (current) current.removeAttribute('aria-busy');
      });
  };

  document.addEventListener('click', (event) => {
    const pill = event.target.closest('#' + BAR + ' .mgx-fc-pill');
    if (pill) {
      const dd = pill.closest('.mgx-fc-dd');
      if (pill.getAttribute('aria-expanded') === 'true') closePanels();
      else openPanel(dd);
      return;
    }
    if (!event.target.closest('#' + BAR + ' .mgx-fc-dd')) closePanels();

    const clear = event.target.closest('[data-mgx-fc-clear]');
    if (clear) {
      event.preventDefault();
      go(clear.getAttribute('href'));
      return;
    }
    if (event.target.closest('#' + BAR + ' .mgx-fc-trigger')) {
      openDrawer();
      return;
    }
    const close = event.target.closest('#' + DRAWER + ' [data-mgx-fc-close]');
    if (close) closeDrawer(close.hasAttribute('data-mgx-fc-apply'));
  });

  document.addEventListener('change', (event) => {
    const form = event.target.closest('[data-mgx-fc-form]');
    if (!form) return;
    go(urlFor(form));
  });

  // Enter in a form (or a click on the no-JS submit) stays on the page too.
  document.addEventListener('submit', (event) => {
    const form = event.target.closest('[data-mgx-fc-form]');
    if (!form) return;
    event.preventDefault();
    go(urlFor(form));
  });

  // Escape from inside an open dropdown puts focus back on its pill, so keyboard and
  // screen-reader users keep their place instead of landing on <body>.
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    const active = document.activeElement;
    const dd = active && active.closest ? active.closest('#' + BAR + ' .mgx-fc-dd') : null;
    closePanels();
    if (dd) {
      const pill = dd.querySelector('.mgx-fc-pill');
      if (pill) pill.focus();
    }
    closeDrawer(false);
  });

  // Tabbing out of an open dropdown closes it.
  document.addEventListener('focusin', (event) => {
    const bar = byId(BAR);
    const open = bar && bar.querySelector('.mgx-fc-pill[aria-expanded="true"]');
    if (open && !open.closest('.mgx-fc-dd').contains(event.target)) closePanels();
  });

  window.mgxFilters = { go };
})();
