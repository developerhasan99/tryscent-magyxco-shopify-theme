/**
 * Infinite scroll for sections/main-collection-product-grid.liquid, shared with the collection
 * search (assets/collection-search.js) through window.mgxCollectionGrid:
 * - one request at a time; the next page is read from #load-more-btn on every call;
 * - re-armed when the filter bar (mgx-filters.js; facets.js in the vertical layout) swaps
 *   #ProductGridContainer (filters, sort), which used to stop
 *   loading for good, and after every load, so it keeps going while the button stays in view;
 * - loadAll() fetches the remaining pages 4 at a time and appends them in page order.
 *
 * Pages are fetched by the section FILE name on purpose: an instance id would repeat the quiz and
 * featured tiles on every page (lander-v2, action-modal). The schema default products_per_page
 * must stay equal to the templates' value (16), or page numbers drift.
 */
(() => {
  if (window.mgxCollectionGrid) return;

  const SECTION_FILE = 'main-collection-product-grid';
  // Schema default of products_per_page: the page size of every fetched page.
  const DEFAULT_PER_PAGE = 16;
  const CONCURRENCY = 4;

  let gen = 0;
  let ctrl = new AbortController();
  let inflight = null;
  let allPromise = null;
  let seen = new Set();
  let io = null;
  let containerObserver = null;

  const grid = () => document.getElementById('product-grid');
  const button = () => document.getElementById('load-more-btn');
  const isComplete = () => {
    const btn = button();
    return !(btn && btn.dataset.nextUrl);
  };

  const rebuildSeen = () => {
    seen = new Set();
    const target = grid();
    if (target) target.querySelectorAll(':scope > li[data-mgx-pid]').forEach((li) => seen.add(li.dataset.mgxPid));
  };

  const pageUrl = (url, page) => {
    const next = new URL(url, location.origin);
    if (page) next.searchParams.set('page', page);
    next.searchParams.set('section_id', SECTION_FILE);
    return next.pathname + next.search;
  };

  const fetchPage = (url, signal) =>
    fetch(url, { signal })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((text) => {
        const doc = new DOMParser().parseFromString(text, 'text/html');
        const next = doc.getElementById('load-more-btn');
        return {
          items: [...doc.querySelectorAll('#product-grid > li.grid__item')],
          next: (next && next.dataset.nextUrl) || '',
        };
      });

  // Skips products already in the grid (the sort can shift between page requests) and keeps
  // images lazy: the first cards of every fetched page come back eager.
  const append = (items, target) => {
    const added = [];
    items.forEach((li) => {
      const pid = li.dataset.mgxPid;
      if (pid) {
        if (seen.has(pid)) return;
        seen.add(pid);
      }
      li.querySelectorAll('img:not([loading="lazy"])').forEach((img) => {
        img.loading = 'lazy';
      });
      target.appendChild(li);
      added.push(li);
    });
    if (added.length) document.dispatchEvent(new CustomEvent('mgx:grid:append', { detail: { items: added } }));
    return added.length;
  };

  const setNext = (next) => {
    const btn = button();
    if (!btn) return;
    if (next) {
      btn.dataset.nextUrl = next;
      return;
    }
    btn.remove();
    const indicator = document.getElementById('loading-indicator');
    if (indicator) indicator.remove();
  };

  const rearm = () => {
    if (!io) return;
    io.disconnect();
    const btn = button();
    if (btn) io.observe(btn);
  };

  const loadNext = () => {
    if (inflight) return inflight;
    const btn = button();
    const url = btn && btn.dataset.nextUrl;
    const target = grid();
    if (!url || !target) return Promise.resolve(0);
    const myGen = gen;
    let advanced = false;
    const indicator = document.getElementById('loading-indicator');
    if (indicator) indicator.style.display = 'block';
    inflight = fetchPage(pageUrl(url), ctrl.signal)
      .then(({ items, next }) => {
        if (myGen !== gen || grid() !== target) return 0;
        advanced = next !== url;
        const added = append(items, target);
        setNext(next);
        return added;
      })
      .catch((error) => {
        if (error.name !== 'AbortError') console.error('Collection grid: could not load more products', error);
        return 0;
      })
      .finally(() => {
        if (myGen === gen) inflight = null;
        if (indicator && indicator.isConnected) indicator.style.display = 'none';
        // Re-observing fires at once while the button is in view, so only after a page that moved
        // on: a failing page waits for the next scroll instead of retrying in a loop.
        if (advanced) rearm();
      });
    return inflight;
  };

  const loadMore = () => (allPromise ? allPromise.then(() => 0) : loadNext());

  const nextUrl = () => {
    const btn = button();
    return (btn && btn.dataset.nextUrl) || '';
  };
  const loadSequential = (myGen) => {
    const before = nextUrl();
    return loadNext().then(() => {
      const after = nextUrl();
      return myGen === gen && after && after !== before ? loadSequential(myGen) : undefined;
    });
  };

  const loadAll = () => {
    if (allPromise) return allPromise;
    const myGen = gen;
    allPromise = Promise.resolve(inflight)
      .then(() => {
        const btn = button();
        const url = btn && btn.dataset.nextUrl;
        const target = grid();
        if (myGen !== gen || !url || !target) return undefined;
        const start = Number(new URL(url, location.origin).searchParams.get('page')) || 0;
        const last = Number(btn.dataset.mgxPages) || 0;
        const sameSize = Number(btn.dataset.mgxPerPage) === DEFAULT_PER_PAGE;
        if (!start || last < start || !sameSize) return loadSequential(myGen);

        const pages = [];
        for (let page = start; page <= last; page += 1) pages.push(page);
        const ready = new Map();
        let cursor = 0;
        let nextPage = start;
        let failed = false;
        const flush = () => {
          while (ready.has(nextPage)) {
            const result = ready.get(nextPage);
            ready.delete(nextPage);
            if (myGen !== gen || grid() !== target) return;
            append(result.items, target);
            setNext(result.next);
            nextPage += 1;
          }
        };
        const attempt = (page, retries) =>
          fetchPage(pageUrl(url, page), ctrl.signal).catch((error) => {
            if (retries > 0 && error.name !== 'AbortError') return attempt(page, retries - 1);
            throw error;
          });
        // A page that fails twice stops the run; #load-more-btn still points at it, so scrolling
        // picks up from there.
        const worker = () => {
          if (failed || myGen !== gen || cursor >= pages.length) return undefined;
          const page = pages[cursor];
          cursor += 1;
          return attempt(page, 1).then(
            (result) => {
              ready.set(page, result);
              flush();
              return worker();
            },
            (error) => {
              failed = true;
              throw error;
            }
          );
        };
        return Promise.all(Array.from({ length: Math.min(CONCURRENCY, pages.length) }, worker)).then(() =>
          myGen === gen && !failed && !isComplete() ? loadSequential(myGen) : undefined
        );
      })
      .catch((error) => {
        if (error.name !== 'AbortError') console.error('Collection grid: could not load every page', error);
      })
      .then(() => {
        if (myGen !== gen) return;
        allPromise = null;
        rearm();
        document.dispatchEvent(new CustomEvent('mgx:grid:complete'));
      });
    return allPromise;
  };

  // facets.js replaces the container's children on every filter and sort.
  const onReplace = () => {
    gen += 1;
    ctrl.abort();
    ctrl = new AbortController();
    inflight = null;
    allPromise = null;
    rebuildSeen();
    rearm();
    document.dispatchEvent(new CustomEvent('mgx:grid:replace'));
  };

  const attach = () => {
    rebuildSeen();
    if (!io && 'IntersectionObserver' in window) {
      io = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadMore();
      }, { rootMargin: '100px' });
    }
    rearm();
    if (containerObserver) containerObserver.disconnect();
    const container = document.getElementById('ProductGridContainer');
    if (container && 'MutationObserver' in window) {
      containerObserver = new MutationObserver(onReplace);
      containerObserver.observe(container, { childList: true });
    }
  };

  window.mgxCollectionGrid = { loadMore, loadAll, isComplete, isLoading: () => !!(inflight || allPromise) };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attach);
  else attach();
  // Theme editor re-renders the section with a new container.
  document.addEventListener('shopify:section:load', () => {
    onReplace();
    attach();
  });
})();
