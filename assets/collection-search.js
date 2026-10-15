/**
 * Collection search (snippets/collection-search.liquid): filters the product grid of
 * sections/main-collection-product-grid.liquid by scent name, number, brand, inspiration and
 * tags, like the search on magicperfume.co's bundle page.
 *
 * Each product <li> carries data-mgx-hay ("title | inspiration") and data-mgx-tags ("tag|tag").
 * The first use loads every remaining page (window.mgxCollectionGrid.loadAll from
 * assets/collection-grid-loader.js), so the whole collection is searched, and the query is
 * re-applied after every page load and after Dawn's filters or sort replace the grid.
 */
(() => {
  const DEBOUNCE_MS = 120;
  // "prefix:value" tags contribute their value (brand:tom-ford -> "tom ford", note:tonka-bean ->
  // "tonka bean"), except these prefixes.
  const SKIP_PREFIXES = ['gender'];
  // Plain tags that say nothing a shopper would type (gender has its own filters), folded.
  const SKIP_TAGS = new Set([
    'men', 'women', 'unisex', 'for men', 'for women', 'fuer maenner', 'fuer frauen', 'dfw active',
    'new', 'new arrival', 'bundle', 'bundle price show', 'giftbox ghost product', 'hide bundle',
    'usa test', 'bundle test', 'mystery box', 'hidden', 'onsale', '25 edp',
  ]);
  const SKIP_TAG_RE = /^test [a-z] \d+$/;
  // Names shoppers use for the same house or note. When one phrase is in a product's text, the
  // others are added too. Folded, whole phrases.
  const SYNONYMS = [
    ['jean paul gaultier', 'jpgaultier', 'jp gaultier', 'jpg', 'gaultier'],
    ['yves saint laurent', 'ysl', 'saint laurent'],
    ['maison francis kurkdjian', 'mfk', 'kurkdjian'],
    ['dolce gabbana', 'dolce and gabbana', 'dg', 'd g'],
    ['louis vuitton', 'lv'],
    ['thierry mugler', 'mugler'],
    ['paco rabanne', 'rabanne'],
    ['giorgio armani', 'emporio armani', 'armani'],
    ['hugo boss', 'boss'],
    ['christian dior', 'dior'],
    ['bvlgari', 'bulgari'],
    ['calvin klein', 'ck'],
    ['viktor rolf', 'viktor and rolf', 'viktor'],
    ['by kilian', 'kilian'],
    ['escentric molecules', 'molecules'],
    ['carolina herrera', 'herrera'],
    ['tom ford', 'tomford'],
    ['vanilla', 'vanille'],
  ];

  const fold = (value) => {
    let text = String(value == null ? '' : value).toLowerCase();
    try {
      text = text.normalize('NFD').replace(/[̀-ͯ]/g, '');
    } catch (e) {}
    return text
      .replace(/ß/g, 'ss')
      .replace(/æ/g, 'ae')
      .replace(/œ/g, 'oe')
      .replace(/ø/g, 'o')
      .replace(/['’`]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  };

  const tagWords = (raw) =>
    String(raw || '')
      .split('|')
      .map((tag) => {
        const colon = tag.indexOf(':');
        if (colon > -1) {
          const prefix = fold(tag.slice(0, colon));
          if (SKIP_PREFIXES.includes(prefix)) return '';
          return tag.slice(colon + 1);
        }
        const folded = fold(tag);
        return SKIP_TAGS.has(folded) || SKIP_TAG_RE.test(folded) ? '' : tag;
      })
      .join(' ');

  // Every number in the title, without and with leading zeros: "034" -> 34, 034; "219M" -> 219.
  const numberWords = (folded) => {
    const words = [];
    (folded.match(/\d+/g) || []).forEach((digits) => {
      const bare = digits.replace(/^0+(?=\d)/, '');
      words.push(bare, bare.padStart(3, '0'));
    });
    return words;
  };

  const cache = new WeakMap();
  const hayFor = (li) => {
    const cached = cache.get(li);
    if (cached) return cached;
    const [title = '', ...rest] = (li.dataset.mgxHay || '').split(' | ');
    const foldedTitle = fold(title);
    let hay = ` ${fold([title, rest.join(' '), tagWords(li.dataset.mgxTags)].join(' '))} ${numberWords(foldedTitle).join(' ')} `;
    SYNONYMS.forEach((group) => {
      if (group.some((phrase) => hay.includes(` ${phrase} `))) hay += `${group.join(' ')} `;
    });
    const entry = { hay, compact: hay.replace(/ /g, '') };
    cache.set(li, entry);
    return entry;
  };

  const parseQuery = (raw) => {
    const folded = fold(raw);
    const terms = folded ? folded.split(' ').map((term) => (/^\d+$/.test(term) ? term.replace(/^0+(?=\d)/, '') : term)) : [];
    return { terms, compact: folded.replace(/ /g, '') };
  };

  // Numbers match a whole word ("21" is not "219m"); words up to 3 letters match the start of a
  // word, so "di" already finds "dior" while typing and "man" skips "gourmand"; longer terms match
  // anywhere.
  const termHit = (hay, term) => {
    if (/^\d+$/.test(term)) return hay.includes(` ${term} `);
    if (term.length <= 3) return hay.includes(` ${term}`);
    return hay.includes(term);
  };

  const matches = (li, query) => {
    const { hay, compact } = hayFor(li);
    // Fallback for words typed together ("tomford", "no247"); from 4 characters, so "man" stays a
    // word start and doesn't hit "gourmand".
    return query.terms.every((term) => termHit(hay, term)) || (query.compact.length >= 4 && compact.includes(query.compact));
  };

  const fill = (template, values) =>
    String(template || '').replace(/\[(count|query)\]/g, (_, key) => values[key]);

  const init = (root) => {
    if (root.dataset.mgxReady) return;
    root.dataset.mgxReady = '1';
    const input = root.querySelector('.mgx-csearch__input');
    const clear = root.querySelector('.mgx-csearch__clear');
    const status = root.querySelector('.mgx-csearch__status');
    const field = root.querySelector('.mgx-csearch__field');
    if (!input || !status) return;
    const text = root.dataset;
    let query = parseQuery('');
    let raw = '';
    let timer = null;

    const loader = () => window.mgxCollectionGrid;
    const complete = () => {
      const grid = loader();
      return !grid || grid.isComplete() || !grid.isLoading();
    };

    let statusKey = '';
    const setStatus = (key, build) => {
      if (key === statusKey) return;
      statusKey = key;
      status.textContent = '';
      if (build) build();
    };
    const renderStatus = (count, grid) => {
      const loading = query.terms.length > 0 && !complete();
      if (grid) {
        if (loading) grid.setAttribute('aria-busy', 'true');
        else grid.removeAttribute('aria-busy');
      }
      if (!query.terms.length) return setStatus('', null);
      const shown = raw.trim();
      if (loading) return setStatus('loading', () => status.append(text.loadingText || ''));
      if (count === 0) {
        return setStatus(`empty:${shown}`, () => {
          status.append(fill(text.emptyText, { query: shown }), ' ');
          const reset = document.createElement('button');
          reset.type = 'button';
          reset.className = 'mgx-csearch__reset';
          reset.textContent = text.clearLabel || 'Clear search';
          reset.addEventListener('click', () => {
            setQuery('');
            input.focus();
          });
          status.append(reset);
        });
      }
      const line = fill(count === 1 ? text.resultText : text.resultsText, { count, query: shown });
      return setStatus(line, () => status.append(line));
    };

    const apply = () => {
      const grid = document.getElementById('product-grid');
      if (!grid || grid.tagName !== 'UL') {
        setStatus('', null);
        return;
      }
      const active = query.terms.length > 0;
      let count = 0;
      [...grid.children].forEach((li) => {
        if (!li.classList.contains('grid__item')) return;
        const isProduct = !!li.dataset.mgxPid;
        const hide = active && (!isProduct || !matches(li, query));
        if (hide) {
          li.hidden = true;
          li.dataset.mgxCsHidden = '';
        } else if ('mgxCsHidden' in li.dataset) {
          li.hidden = false;
          delete li.dataset.mgxCsHidden;
        }
        if (active && isProduct && !hide) count += 1;
      });
      renderStatus(count, grid);
    };

    const loadAll = () => {
      const grid = loader();
      if (grid && !grid.isComplete()) grid.loadAll().then(apply);
    };

    function setQuery(value) {
      clearTimeout(timer);
      raw = value;
      if (input.value !== value) input.value = value;
      query = parseQuery(value);
      if (clear) clear.hidden = !value;
      if (query.terms.length) loadAll();
      apply();
    }

    input.addEventListener('input', () => {
      if (clear) clear.hidden = !input.value;
      clearTimeout(timer);
      timer = setTimeout(() => setQuery(input.value), DEBOUNCE_MS);
    });
    // Start loading the rest of the collection as soon as the shopper is about to type.
    input.addEventListener('focus', loadAll, { once: true });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && input.value) {
        event.preventDefault();
        event.stopPropagation();
        setQuery('');
      } else if (event.key === 'Enter') {
        event.preventDefault();
        setQuery(input.value);
        input.blur();
      }
    });
    if (clear) {
      clear.addEventListener('click', () => {
        setQuery('');
        input.focus();
      });
    }
    if (field) {
      field.addEventListener('click', (event) => {
        if (event.target === field) input.focus();
      });
    }
    // Page-level listeners stop with this bar: the theme editor re-renders the section.
    const listeners = new AbortController();
    const live = (handler) => (...args) => (root.isConnected ? handler(...args) : listeners.abort());
    const opts = { signal: listeners.signal };
    document.addEventListener('mgx:grid:append', live(apply), opts);
    document.addEventListener('mgx:grid:complete', live(apply), opts);
    document.addEventListener(
      'mgx:grid:replace',
      live(() => {
        if (query.terms.length) loadAll();
        apply();
      }),
      opts
    );
    // Back/forward cache or browser autofill can leave text in the box.
    window.addEventListener(
      'pageshow',
      live(() => {
        if (input.value !== raw) setQuery(input.value);
      }),
      opts
    );
    if (input.value) setQuery(input.value);
  };

  const start = () => document.querySelectorAll('[data-mgx-csearch]').forEach(init);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
  document.addEventListener('shopify:section:load', start);

  window.mgxCollectionSearch = {
    fold,
    parseQuery,
    // QA: does a product with this title and tags match the query?
    matchText: (title, tags, raw) => {
      const li = document.createElement('li');
      li.dataset.mgxHay = `${title} | `;
      li.dataset.mgxTags = Array.isArray(tags) ? tags.join('|') : tags || '';
      return matches(li, parseQuery(raw));
    },
  };
})();
