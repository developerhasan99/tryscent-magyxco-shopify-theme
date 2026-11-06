// Scent Profile Quiz: renders data/quiz.json screen by screen, keeps every answer in the URL
// (back / refresh / share keep state), then scores with js/score.js and renders the results.
(function () {
  const app = document.getElementById('app');
  const backBtn = document.querySelector('.qz-back');
  const stepPill = document.querySelector('.qz-step');
  const toastEl = document.querySelector('.qz-toast');

  // Bundle offer shown on the results page. On magyx.whop.site the live price comes from /api/bundle-state.
  const BUNDLE = { handle: 'bundle-6x50-79', price: 79, compare: 180 };
  // Shopify theme (magyx.co /pages/scent-quiz): sections/scent-quiz.liquid sets window.SQ_STORE (visitor currency,
  // bundle, each scent's store title / image / 50 ml price) and assets/scent-quiz-data.js sets window.SQ_DATA.
  const SHOP = window.SQ_STORE || null;
  const STORE = SHOP ? SHOP.root : 'https://magyx.whop.site';
  // Served by the store (magyx.whop.site/scent-quiz/, its local preview, or the Shopify page): real checkout, store prices, no email stub.
  const LIVE = !!SHOP || /whop\.site$/.test(location.hostname) || location.pathname.startsWith('/scent-quiz/');
  // "Free shipping" lines only where the store really ships the bundle free (Shopify: per country, set by the section).
  const FREE = !SHOP || !!SHOP.bundle.freeShipping;
  // img/<name>.jpg -> the store's asset URL on Shopify, the relative path elsewhere.
  const imgUrl = (src) => (src && SHOP && SHOP.images[src.replace(/^img\//, '')]) || src;
  // Visitor currency. On the store: the worker's market (/api/geo), the live bundle price (/api/bundle-state) and each
  // scent's 50 ml price (markets.json). Designer prices are US retail, so the designer comparison shows in USD only.
  let CUR = 'usd', MARKETS = null;
  const ANALYZE_MS = 5000;
  const AGE_DEBOUNCE = 1000;
  // EU (index.html): step-by-step reveal. US (us.html): one "Reveal my match" button, then the whole wardrobe
  // with the offer, a countdown and a swap picker.
  const VARIANT = document.documentElement.dataset.variant === 'us' ? 'us' : 'eu';
  const OFFER_MIN = 10; // US countdown length (56% off + free shipping)
  const OFFER_KEY = 'sq_us_offer_end';

  let QUIZ, PROFILES, CATALOG, LABELS, DESIGNER = {}, result = null, pack = [], revealed = 0;

  // ---------- state in the URL ----------
  const KEYS = ['gender', 'unisex', 'notes', 'scents', 'mood', 'energy', 'habit', 'age', 'feel'];
  function readState() {
    const q = new URLSearchParams(location.search);
    const s = { step: q.get('step') || 'gender' };
    for (const k of KEYS) if (q.has(k)) s[k] = k === 'notes' ? (q.get(k) ? q.get(k).split('|') : []) : q.get(k);
    return s;
  }
  function writeState(s, replace) {
    const q = new URLSearchParams();
    q.set('step', s.step);
    for (const k of KEYS) if (s[k] !== undefined) q.set(k, k === 'notes' ? s[k].join('|') : s[k]);
    const url = location.pathname + '?' + q.toString();
    replace ? history.replaceState(null, '', url) : history.pushState(null, '', url);
  }

  function flowFor(s) {
    if (s.gender === 'female') return QUIZ.flow.female;
    if (s.gender === 'male') return QUIZ.flow.male[s.scents === 'sporty' ? 'sporty' : 'sophisticated'];
    return QUIZ.flow.female; // before gender is known, step 1 is all we need
  }
  const answered = (s, id) => s[id] !== undefined;

  // ---------- helpers ----------
  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'html') n.innerHTML = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) n.append(kid.nodeType ? kid : document.createTextNode(kid));
    return n;
  };
  const money = (n) => {
    try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: CUR.toUpperCase(), minimumFractionDigits: Number.isInteger(n) ? 0 : 2 }).format(n); }
    catch (e) { return '$' + (Number.isInteger(n) ? n : n.toFixed(2)); }
  };
  const priceOf = (p) => {
    if (CUR === 'usd' || SHOP) return p.variant50.price;
    const c = MARKETS?.prices?.[CUR]?.[p.variant50.id]?.[0];
    return Number.isInteger(c) ? c / 100 : null;
  };
  const answersFor = (q, s) => (Array.isArray(q.answers) ? q.answers : q.answers[s.gender] || []);
  const imgFor = (src, s) => src && imgUrl(src.replace('{g}', s.gender));
  function toast(msg) {
    toastEl.textContent = msg; toastEl.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => (toastEl.hidden = true), 3200);
  }
  function track(event, params = {}) {
    try { window.dataLayer && window.dataLayer.push({ event: 'scent_quiz_' + event, ...params }); } catch (e) {}
    try { window.fbq && window.fbq('trackCustom', 'ScentQuiz' + event.replace(/(^|_)(\w)/g, (m, a, b) => b.toUpperCase()), params); } catch (e) {}
    try { window.gtag && window.gtag('event', 'scent_quiz_' + event, params); } catch (e) {}
    try { console.log('[scent quiz]', event, params); } catch (e) {}
  }

  // ---------- navigation ----------
  function go(s, nextStep) {
    s.step = nextStep;
    writeState(s);
    render();
    window.scrollTo({ top: 0 });
  }
  function answer(s, id, value) {
    s[id] = value;
    // A changed branch answer invalidates everything after it.
    const flow = flowFor(s);
    const idx = flow.indexOf(id);
    for (const k of KEYS) if (flow.indexOf(k) > idx || (!flow.includes(k) && k !== id)) delete s[k];
    track('answer', { question: id, answer: Array.isArray(value) ? value.join('|') : value });
    const next = flowFor(s)[flowFor(s).indexOf(id) + 1];
    go(s, next || 'analyzing');
  }
  backBtn.addEventListener('click', () => {
    const s = readState();
    const flow = flowFor(s);
    const at = s.step === 'results' || s.step === 'analyzing' ? flow.length : flow.indexOf(s.step);
    if (at <= 0) { history.length > 1 ? history.back() : (location.href = STORE); return; }
    const prev = flow[at - 1];
    delete s[prev];
    go(s, prev);
  });
  addEventListener('popstate', render);

  // ---------- render ----------
  function render() {
    const s = readState();
    const flow = flowFor(s);
    // Deep link to a step whose earlier answers are missing -> restart.
    const need = s.step === 'analyzing' || s.step === 'results' ? flow : flow.slice(0, Math.max(0, flow.indexOf(s.step)));
    if ((flow.indexOf(s.step) < 0 && !['analyzing', 'results'].includes(s.step)) || need.some((k) => !answered(s, k))) {
      writeState({ step: 'gender' }, true);
      return render();
    }
    document.body.dataset.screen = s.step;
    const idx = flow.indexOf(s.step);
    backBtn.hidden = s.step === 'analyzing';
    stepPill.hidden = idx < 1;
    stepPill.textContent = `${idx + 1} of ${flow.length}`;
    app.replaceChildren();
    if (s.step === 'analyzing') return renderAnalyzing(s);
    if (s.step === 'results') return renderResults(s);
    if (idx === 0 && !render.started) { render.started = true; track('start'); }
    const q = QUIZ.questions[s.step];
    const head = el('div', { class: 'qz-q-head' }, el('h1', { class: 'qz-title' }, q.title), q.subtitle && el('p', { class: 'qz-sub' }, q.subtitle),
      q.image && el('img', { class: 'qz-q-img', src: imgUrl(q.image), alt: '', width: 880, height: 657 }));
    const body = { split: renderSplit, text: renderSplit, notes: renderNotes, age: renderAge, carousel: renderCarousel }[q.type](q, s);
    app.append(el('section', { class: `qz-screen qz-${q.type}` }, head, body));
  }

  function renderSplit(q, s) {
    const id = s.step;
    return el('div', { class: 'qz-cards' }, answersFor(q, s).map((a) =>
      el('button', { type: 'button', class: 'qz-card' + (a.image ? '' : ' qz-card--text'), onclick: () => answer(s, id, a.id) },
        a.image && el('img', { class: 'qz-card-img', src: imgFor(a.image, s), alt: '', width: 640, height: 640, loading: 'eager' }),
        el('span', { class: 'qz-card-text' },
          el('strong', { class: 'qz-card-title' }, a.title),
          a.description && el('span', { class: 'qz-card-desc' }, a.description),
          a.body && el('span', { class: 'qz-card-body' }, a.body)))));
  }

  function renderNotes(q, s) {
    const picked = new Set(s._draft || []);
    const cont = el('button', { type: 'button', class: 'qz-btn qz-btn--primary', hidden: true, onclick: () => answer(s, 'notes', [...picked]) }, 'Continue');
    const count = el('p', { class: 'qz-count' });
    const sync = () => {
      cont.hidden = !picked.size;
      count.textContent = picked.size ? `${picked.size} of ${q.max} picked` : '';
      chips.querySelectorAll('.qz-chip').forEach((c) => {
        const on = picked.has(c.dataset.id);
        c.setAttribute('aria-pressed', on);
        c.disabled = !on && picked.size >= q.max;
      });
    };
    const chips = el('div', { class: 'qz-chips' }, q.answers.map((a) =>
      el('button', { type: 'button', class: 'qz-chip', 'data-id': a.id, 'aria-pressed': 'false', onclick: () => {
        picked.has(a.id) ? picked.delete(a.id) : picked.size < q.max && picked.add(a.id);
        sync();
      } }, a.title)));
    sync();
    return el('div', {}, chips, el('div', { class: 'qz-actions' }, count, cont,
      el('button', { type: 'button', class: 'qz-link', onclick: () => answer(s, 'notes', []) }, 'Skip this question')));
  }

  function renderAge(q, s) {
    const err = el('p', { class: 'qz-error', hidden: true }, q.error);
    const valid = (v) => /^\d{1,3}$/.test(v) && +v >= q.min && +v <= q.max;
    const cont = el('button', { type: 'button', class: 'qz-btn qz-btn--primary', hidden: true, onclick: () => valid(input.value) && answer(s, 'age', input.value) }, 'Continue');
    const input = el('input', { class: 'qz-age-input', type: 'text', inputmode: 'numeric', autocomplete: 'off', maxlength: 3, placeholder: '00', 'aria-label': 'Your age' });
    let t;
    input.addEventListener('input', () => {
      input.value = input.value.replace(/\D/g, '').slice(0, 3);
      const ok = valid(input.value);
      cont.hidden = !ok; err.hidden = true; clearTimeout(t);
      if (input.value && !ok) t = setTimeout(() => (err.hidden = false), AGE_DEBOUNCE);
    });
    input.addEventListener('keydown', (e) => e.key === 'Enter' && valid(input.value) && answer(s, 'age', input.value));
    setTimeout(() => input.focus(), 50);
    return el('div', { class: 'qz-age-wrap' }, input, err, el('div', { class: 'qz-actions' }, cont,
      el('button', { type: 'button', class: 'qz-btn qz-btn--ghost', onclick: () => answer(s, 'age', '') }, q.skip)));
  }

  function renderCarousel(q, s) {
    return el('div', { class: 'qz-feel' }, answersFor(q, s).map((a) =>
      el('button', { type: 'button', class: 'qz-feel-card', onclick: () => answer(s, 'feel', a.id) },
        el('img', { src: imgUrl(a.image), alt: '', width: 480, height: 600 }),
        el('span', {}, a.title))));
  }

  function renderAnalyzing(s) {
    const pct = el('strong', { class: 'qz-an-pct' }, '0%');
    const fill = el('span', { class: 'qz-an-fill' });
    const copy = VARIANT === 'us' ? QUIZ.analyzingUS : QUIZ.analyzing;
    const reveal = el('button', { type: 'button', class: 'qz-btn qz-btn--primary qz-an-cta', hidden: true, onclick: () => {
      track('reveal', { section: 'match' });
      justAnalyzed = true; s.step = 'results'; writeState(s, true); render(); window.scrollTo({ top: 0 });
    } }, copy.cta || '');
    const title = el('h1', { class: 'qz-title' }, copy.title);
    const body = el('p', { class: 'qz-sub' }, copy.body);
    app.append(el('section', { class: 'qz-screen qz-analyzing' },
      el('div', { class: 'qz-an-media' }, el('img', { src: imgUrl('img/analyzing.jpg'), alt: '' })),
      el('div', { class: 'qz-an-text' }, pct, el('span', { class: 'qz-an-bar' }, fill), title, body, reveal)));
    const t0 = performance.now();
    const tick = (now) => {
      if (readState().step !== 'analyzing') return;
      const p = Math.min(1, (now - t0) / ANALYZE_MS);
      pct.textContent = Math.round(p * 100) + '%';
      fill.style.width = p * 100 + '%';
      if (p < 1) requestAnimationFrame(tick);
      else if (VARIANT === 'us') { title.textContent = copy.doneTitle; body.textContent = copy.doneBody; reveal.hidden = false; reveal.focus(); }
      else { justAnalyzed = true; s.step = 'results'; writeState(s, true); render(); }
    };
    requestAnimationFrame(tick);
  }

  // ---------- results ----------
  const SECTIONS = ['profile', 'families', 'notes', 'best', 'pack'];
  // Step-by-step reveal only right after the analyzing screen; a refreshed or shared results link opens fully revealed.
  let justAnalyzed = false;
  const REVEAL_LABEL = { profile: 'Reveal my scent families', families: 'Reveal my notes', notes: 'Reveal my best match', best: 'Build my 6-bottle set' };

  function renderResults(s) {
    const key = KEYS.map((k) => k + '=' + (s[k] ?? '')).join('&');
    if (!result || result._key !== key) {
      result = ScentScore.recommend(s, CATALOG, PROFILES, QUIZ, LABELS);
      result._key = key;
      pack = result.pack.slice();
      revealed = justAnalyzed ? 0 : SECTIONS.length - 1;
      justAnalyzed = false;
      track('complete', { profile: result.profile.name, gender: s.gender, habit: s.habit, notes: (s.notes || []).join('|'), age: s.age || '' });
    }
    stepPill.hidden = true;
    const wrap = el('div', { class: 'qz-results' });
    app.append(wrap);
    if (VARIANT === 'us') {
      wrap.append(section('match', s, true), section('pack', s, true));
      wrap.append(el('p', { class: 'qz-retake' }, el('a', { href: location.pathname, onclick: () => track('retake') }, 'Retake the quiz')));
      return;
    }
    for (let i = 0; i <= revealed && i < SECTIONS.length; i++) wrap.append(section(SECTIONS[i], s, i === revealed));
    const next = SECTIONS[revealed + 1];
    if (next) {
      wrap.append(el('div', { class: 'qz-reveal' },
        el('button', { type: 'button', class: 'qz-btn qz-btn--primary', onclick: () => { revealed++; renderResults2(); } }, REVEAL_LABEL[SECTIONS[revealed]]),
        el('button', { type: 'button', class: 'qz-link', onclick: () => { revealed = SECTIONS.length - 1; renderResults2(true); } }, 'Skip to my matches')));
    }
    wrap.append(el('p', { class: 'qz-retake' }, el('a', { href: location.pathname, onclick: () => track('retake') }, 'Retake the quiz')));
  }
  // Re-render results in place and scroll to the newly revealed section.
  function renderResults2(toPack) {
    app.replaceChildren();
    renderResults(readState());
    const target = app.querySelector(`[data-section="${toPack ? 'best' : SECTIONS[revealed]}"]`);
    target && target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    track('reveal', { section: SECTIONS[revealed] });
  }

  function section(name, s, fresh) {
    const r = result, prof = r.profile;
    const cls = 'qz-res qz-res--' + name + (fresh ? ' is-new' : '');
    if (name === 'profile') {
      return el('section', { class: cls, 'data-section': name },
        el('p', { class: 'qz-eyebrow' }, 'Your scent profile'),
        el('h1', { class: 'qz-prof-name' }, prof.name),
        el('p', { class: 'qz-prof-tag' }, prof.tagline),
        el('p', { class: 'qz-prof-desc' }, prof.description),
        el('div', { class: 'qz-tags' }, prof.chips.map((c) => el('span', { class: 'qz-tag' }, c))),
        el('div', { class: 'qz-prof-bottles', 'aria-hidden': 'true' }, pack.slice(0, 3).map((p) => el('img', { src: p.image, alt: '' }))));
    }
    if (name === 'families') {
      return el('section', { class: cls, 'data-section': name },
        el('h2', { class: 'qz-h2' }, 'Your scent families'),
        el('p', { class: 'qz-sub' }, 'You lean most toward ', el('strong', {}, QUIZ.familyLabels[r.families[0].id]), '.'),
        el('div', { class: 'qz-bars' }, r.families.map((f) =>
          el('div', { class: 'qz-bar' }, el('span', { class: 'qz-bar-label' }, QUIZ.familyLabels[f.id]),
            el('span', { class: 'qz-bar-track' }, el('span', { class: 'qz-bar-fill', style: `--w:${f.pct}%` })),
            el('span', { class: 'qz-bar-pct' }, f.pct + '%')))));
    }
    if (name === 'notes') {
      return el('section', { class: cls, 'data-section': name },
        el('h2', { class: 'qz-h2' }, "Notes you'll love"),
        el('p', { class: 'qz-sub' }, 'The notes that show up most in the scents we picked for you.'),
        el('div', { class: 'qz-note-grid' }, r.notes.map((g) => el('span', { class: 'qz-note' + ((s.notes || []).includes(g) ? ' is-picked' : '') }, LABELS.groups[g]))));
    }
    if (name === 'match') {
      const b = pack[0];
      return el('section', { class: cls + ' qz-res--best', 'data-section': name },
        el('p', { class: 'qz-eyebrow' }, 'Your perfect match'),
        el('p', { class: 'qz-match-prof' }, 'Scent profile: ', el('strong', {}, prof.name), ' · ' + prof.tagline),
        el('article', { class: 'qz-best' },
          el('div', { class: 'qz-best-media' }, el('span', { class: 'qz-badge' }, b.match + '% match'), el('img', { src: b.image, alt: b.title, width: 600, height: 600 })),
          el('div', { class: 'qz-best-info' },
            el('h3', { class: 'qz-best-title' }, b.title, el('span', { class: 'qz-no' }, ' No. ' + b.number)),
            designerCompare(b) || inspired(b, 'qz-ib--lg'),
            el('p', { class: 'qz-why' }, b.whyLong || b.why),
            pyramid(b))));
    }
    if (name === 'best') {
      const b = pack[0];
      return el('section', { class: cls, 'data-section': name },
        el('h2', { class: 'qz-h2' }, 'Your best match'),
        el('article', { class: 'qz-best' },
          el('div', { class: 'qz-best-media' }, el('span', { class: 'qz-badge' }, b.match + '% match'), el('img', { src: b.image, alt: b.title, width: 600, height: 600 })),
          el('div', { class: 'qz-best-info' },
            el('h3', { class: 'qz-best-title' }, b.title, el('span', { class: 'qz-no' }, ' No. ' + b.number)),
            inspired(b, 'qz-ib--lg'),
            el('p', { class: 'qz-why' }, b.whyLong || b.why),
            pyramid(b),
            priceOf(b) != null && el('p', { class: 'qz-price' }, money(priceOf(b)), el('span', {}, ' · 50 ml')))));
    }
    // pack
    const count = el('span');
    const list = el('div', { class: 'qz-pack' });
    const draw = () => {
      list.replaceChildren(...pack.map((p, i) => el('article', { class: 'qz-pick' + (i === 0 ? ' is-best' : '') },
        el('img', { src: p.image, alt: p.title, width: 300, height: 300, loading: 'lazy' }),
        el('div', { class: 'qz-pick-info' },
          el('span', { class: 'qz-pick-match' }, i === 0 ? 'Best match' : p.match + '% match'),
          el('strong', {}, p.title, el('span', { class: 'qz-no' }, ' No. ' + p.number)),
          inspired(p),
          el('span', { class: 'qz-pick-why' }, p.why)),
        i > 0 && el('button', { type: 'button', class: 'qz-swap', 'aria-label': 'Swap ' + p.title, onclick: () => (VARIANT === 'us' ? openPicker(i, draw) : swap(i, draw)) }, 'Swap'))));
      count.textContent = pack.length;
    };
    draw();
    shopTestPrice();
    const save = BUNDLE.compare > BUNDLE.price ? Math.round((1 - BUNDLE.price / BUNDLE.compare) * 100) : 0;
    if (VARIANT === 'us') return usPack(cls, name, s, list, save);
    return el('section', { class: cls, 'data-section': name },
      el('h2', { class: 'qz-h2' }, s.habit === 'spritzer' ? 'Your signature set' : 'Your scent wardrobe'),
      el('p', { class: 'qz-sub' }, s.habit === 'spritzer'
        ? 'Your best match plus five close cousins. Swap any bottle you want.'
        : 'Six scents in your profile, with room to switch it up. Swap any bottle you want.'),
      list,
      el('div', { class: 'qz-cta-box' },
        el('p', { class: 'qz-cta-price' }, el('strong', {}, money(BUNDLE.price)), BUNDLE.compare > BUNDLE.price && el('s', {}, money(BUNDLE.compare)), save && el('span', { class: 'qz-save' }, `Save ${save}%`)),
        el('p', { class: 'qz-cta-note' }, '6 × 50 ml bottles, ', count, ' scents picked for you'),
        el('a', { class: 'qz-btn qz-btn--primary qz-btn--wide', href: bundleUrl(), onclick: (e) => checkout(e) }, 'Get my 6 scents')),
      emailBox(s));
  }

  // "Inspired by" field: the designer bottle next to its name, so the customer sees which perfume ours is like.
  function inspired(p, mod) {
    const b = p.inspiredBy;
    if (!b.name) return null;
    return el('span', { class: 'qz-ib' + (mod ? ' ' + mod : '') },
      b.image ? el('img', { src: b.image, alt: b.name, width: 80, height: 80, loading: 'lazy' }) : el('span', { class: 'qz-ib-ph', 'aria-hidden': 'true' }),
      el('span', { class: 'qz-ib-text' },
        el('span', { class: 'qz-ib-k' }, 'Inspired by'),
        el('b', {}, b.name),
        b.house && el('span', { class: 'qz-ib-house' }, b.house)));
  }

  // ---------- US: designer comparison ----------
  // Designer bottle + verified US retail price (data/designer-prices.json, every price has a source URL) next to ours.
  // No verified price = no comparison; the plain "Inspired by" line shows instead.
  function designerCompare(p) {
    const d = DESIGNER[String(+p.number)] || DESIGNER[p.number];
    if (VARIANT !== 'us' || CUR !== 'usd' || !d || !d.price_usd || !p.inspiredBy.name) return null;
    const ours = p.variant50.price;
    const saving = d.size_ml === 50
      ? `Save ${money(Math.round((d.price_usd - ours) * 100) / 100)} vs the designer bottle`
      : `${Math.round((1 - (ours / 50) / (d.price_usd / d.size_ml)) * 100)}% less per ml than the designer bottle`;
    const img = p.inspiredBy.image;
    return el('div', { class: 'qz-cmp' },
      el('div', { class: 'qz-cmp-row' },
        el('div', { class: 'qz-cmp-col' },
          img && el('img', { src: img, alt: '', width: 160, height: 160, loading: 'lazy' }),
          el('span', { class: 'qz-cmp-k' }, 'Inspired by'),
          el('strong', {}, d.name || p.inspiredBy.name),
          el('span', { class: 'qz-cmp-house' }, d.house || p.inspiredBy.house),
          el('s', { class: 'qz-cmp-price' }, `${money(d.price_usd)} · ${d.size_ml} ml`)),
        el('span', { class: 'qz-cmp-vs', 'aria-hidden': 'true' }, 'vs'),
        el('div', { class: 'qz-cmp-col is-ours' },
          el('img', { src: p.image, alt: '', width: 160, height: 160, loading: 'lazy' }),
          el('span', { class: 'qz-cmp-k' }, 'Your match'),
          el('strong', {}, p.title),
          el('span', { class: 'qz-cmp-house' }, 'MAGYX No. ' + p.number),
          el('b', { class: 'qz-cmp-price' }, `${money(ours)} · 50 ml`))),
      el('p', { class: 'qz-cmp-save' }, saving));
  }

  // ---------- US: offer, countdown, swap picker ----------
  // Shopify (section setting "Flat price"): one flat price, no strike-through, and what's included as icon
  // tiles: free shipping (only where the bundle ships free), the store's 60-day money-back guarantee and the
  // free mystery gift (only where the bundle price reaches the cart gift app's threshold, set by the section).
  const ICON = {
    ship: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h11v10H3z"/><path d="M14 9h4l3 3v4h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17.5" cy="17.5" r="1.8"/></svg>',
    guarantee: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/></svg>',
    gift: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 11h16v10H4z"/><path d="M3 7h18v4H3z"/><path d="M12 7v14"/><path d="M12 7c-1.5-3-5-3.5-5-1.2C7 7 9.5 7 12 7zM12 7c1.5-3 5-3.5 5-1.2C17 7 14.5 7 12 7z"/></svg>',
  };
  function flatPack(cls, name, s, list) {
    const gift = !!SHOP.bundle.gift;
    const perk = (icon, title, note) => el('li', { class: 'qz-perk', html: ICON[icon] }, el('span', {}, title, note && el('small', {}, note)));
    const perks = [FREE && perk('ship', 'Free shipping'), perk('guarantee', '60‑day money‑back', 'guarantee'), gift && perk('gift', 'Free mystery gift', 'in your order')].filter(Boolean);
    const clock = el('strong', { class: 'qz-timer-clock', 'aria-hidden': 'true' }, String(OFFER_MIN).padStart(2, '0') + ':00.00');
    const note = el('span', { class: 'qz-timer-note' }, gift ? 'Your set and your free mystery gift are reserved while the timer runs.' : 'Your set is reserved while the timer runs.');
    const deal = el('div', { class: 'qz-timer qz-deal', role: 'timer' },
      el('span', { class: 'qz-timer-label' }, 'Your scent wardrobe'),
      el('p', { class: 'qz-cta-price' }, el('strong', {}, money(BUNDLE.price))),
      el('p', { class: 'qz-value-note' }, '6 × 50 ml bottles picked for you'),
      el('ul', { class: 'qz-perks', style: `--n:${perks.length}` }, perks),
      el('span', { class: 'qz-deal-clock' }, el('span', { class: 'qz-deal-k' }, 'Reserved for'), clock),
      el('a', { class: 'qz-btn qz-btn--primary qz-btn--wide qz-btn--cta', href: bundleUrl(), onclick: (e) => checkout(e) }, 'Check out now'),
      note);
    startCountdown(clock, note, 0, gift ? 'Check out now to lock in your set and your free mystery gift.' : 'Check out now to lock in your set.');
    return el('section', { class: cls + ' qz-res--offer', 'data-section': name },
      deal,
      el('h2', { class: 'qz-h2' }, s.habit === 'spritzer' ? 'Your signature set' : 'Your 6 scents'),
      el('p', { class: 'qz-sub' }, 'Tap Swap on any bottle to choose another scent.'),
      list);
  }

  function usPack(cls, name, s, list, save) {
    if (SHOP && SHOP.bundle.flat) return flatPack(cls, name, s, list);
    // Price, countdown and checkout button are one tile above the wardrobe: the deal and the action sit together.
    const clock = el('strong', { class: 'qz-timer-clock', 'aria-hidden': 'true' }, String(OFFER_MIN).padStart(2, '0') + ':00.00');
    const note = el('span', { class: 'qz-timer-note' }, FREE ? `${save}% off + free shipping while the timer runs.` : `${save}% off while the timer runs.`);
    const deal = el('div', { class: 'qz-timer qz-deal', role: 'timer' },
      el('span', { class: 'qz-timer-label' }, 'Your scent wardrobe'),
      el('p', { class: 'qz-cta-price' }, el('strong', {}, money(BUNDLE.price)), BUNDLE.compare > BUNDLE.price && el('s', {}, money(BUNDLE.compare)), save && el('span', { class: 'qz-save' }, `Save ${save}%`)),
      el('p', { class: 'qz-value-note' }, '6 × 50 ml bottles picked for you', FREE && ' · ', FREE && el('strong', {}, 'Free shipping')),
      el('span', { class: 'qz-deal-clock' }, el('span', { class: 'qz-deal-k' }, 'Reserved for'), clock),
      el('a', { class: 'qz-btn qz-btn--primary qz-btn--wide qz-btn--cta', href: bundleUrl(), onclick: (e) => checkout(e) }, FREE ? `Check out now, save ${save}% and get free shipping` : `Check out now and save ${save}%`),
      note);
    startCountdown(clock, note, save);
    return el('section', { class: cls + ' qz-res--offer', 'data-section': name },
      deal,
      el('h2', { class: 'qz-h2' }, s.habit === 'spritzer' ? 'Your signature set' : 'Your 6 scents'),
      el('p', { class: 'qz-sub' }, 'Tap Swap on any bottle to choose another scent.'),
      list,
      emailBox(s));
  }

  // The deadline survives refreshes; a fresh countdown starts once the old one has been over for an hour.
  function startCountdown(clock, note, save, doneText) {
    let end = 0;
    try { end = +localStorage.getItem(OFFER_KEY) || 0; } catch (e) {}
    if (!end || Date.now() - end > 3600e3) {
      end = Date.now() + OFFER_MIN * 60e3;
      try { localStorage.setItem(OFFER_KEY, String(end)); } catch (e) {}
    }
    // MM:SS.hh, redrawn every frame so the hundredths run. The clock is built before it is placed on the page,
    // so only stop once it was shown and then removed.
    let shown = false;
    const pad = (n) => String(n).padStart(2, '0');
    const tick = () => {
      if (clock.isConnected) shown = true;
      else if (shown) return;
      const left = Math.max(0, end - Date.now());
      clock.textContent = `${pad(Math.floor(left / 60e3))}:${pad(Math.floor((left % 60e3) / 1000))}.${pad(Math.floor((left % 1000) / 10))}`;
      if (!left) { note.textContent = doneText || `Check out now to lock in ${save}% off.`; return; }
      requestAnimationFrame(tick);
    };
    tick();
  }

  const PICKER_TABS = [
    { id: 'matches', label: 'Your matches' },
    { id: 'best-sellers', label: 'Best sellers' },
    { id: 'for-women', label: 'For her' },
    { id: 'for-men', label: 'For him' },
    { id: 'unisex', label: 'Unisex' },
    { id: 'new-scents', label: 'New' },
  ];
  function openPicker(slot, draw) {
    const scored = new Map(result.all.map((p) => [p.id, p]));
    const withMatch = (p) => scored.get(p.id) || p;
    let tab = 'matches', query = '';
    const grid = el('div', { class: 'qz-pk-grid' });
    const search = el('input', { type: 'search', class: 'qz-pk-search', placeholder: 'Search a scent or "inspired by"', 'aria-label': 'Search scents' });
    const tabs = el('div', { class: 'qz-pk-tabs', role: 'tablist' }, PICKER_TABS.map((t) =>
      el('button', { type: 'button', role: 'tab', class: 'qz-pk-tab', 'data-tab': t.id, onclick: () => { tab = t.id; paint(); } }, t.label)));
    const dlg = el('dialog', { class: 'qz-picker', 'aria-label': 'Choose a scent' },
      el('div', { class: 'qz-pk-head' },
        el('div', {}, el('h2', { class: 'qz-h2' }, 'Swap ' + pack[slot].title), el('p', { class: 'qz-sub' }, 'Pick any scent. Each one shows the perfume it is inspired by.')),
        el('button', { type: 'button', class: 'qz-pk-close', 'aria-label': 'Close', onclick: () => dlg.close() }, '×')),
      search, tabs, grid);
    const choose = (p) => {
      const out = pack[slot];
      pack[slot] = p;
      track('swap', { out: out.handle, in: p.handle, slot, tab: query.trim() ? 'search' : tab });
      dlg.close();
      draw();
      const a = app.querySelector('.qz-btn--cta');
      a && (a.href = bundleUrl());
      toast(p.title + ' is in your set');
    };
    function paint() {
      tabs.querySelectorAll('.qz-pk-tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
      const inPack = new Set(pack.map((p) => p.id));
      const q = query.trim().toLowerCase();
      let items;
      if (q) items = CATALOG.products.map(withMatch).filter((p) => `${p.title} ${p.number} ${p.inspiredBy.name} ${p.inspiredBy.house}`.toLowerCase().includes(q));
      else if (tab === 'matches') items = result.all;
      else items = CATALOG.products.filter((p) => p.collections.includes(tab)).map(withMatch).sort((a, b) => (a.bestseller || 999) - (b.bestseller || 999));
      items = items.filter((p) => !inPack.has(p.id));
      grid.replaceChildren(...(items.length ? items.map((p) => el('button', { type: 'button', class: 'qz-pk-item', onclick: () => choose(p) },
        el('img', { src: p.image, alt: '', width: 300, height: 300, loading: 'lazy' }),
        el('span', { class: 'qz-pk-info' },
          p.match && el('span', { class: 'qz-pick-match' }, p.match + '% match'),
          el('strong', {}, p.title, el('span', { class: 'qz-no' }, ' No. ' + p.number)),
          inspired(p))))
        : [el('p', { class: 'qz-sub' }, 'No scents found.')]));
    }
    search.addEventListener('input', () => { query = search.value; paint(); });
    dlg.addEventListener('close', () => dlg.remove());
    dlg.addEventListener('click', (e) => e.target === dlg && dlg.close());
    document.body.append(dlg);
    paint();
    dlg.showModal();
    track('picker_open', { slot });
  }

  function pyramid(p) {
    const row = (label, ns) => ns.length ? el('div', { class: 'qz-pyr-row' }, el('span', {}, label), el('span', {}, ns.slice(0, 5).map(cap).join(', '))) : null;
    return el('div', { class: 'qz-pyr' }, row('Top', p.notes.top), row('Heart', p.notes.heart), row('Base', p.notes.base));
  }
  const cap = (n) => n.replace(/\b\w/g, (c) => c.toUpperCase());

  function swap(i, draw) {
    const used = new Set(pack.map((p) => p.id));
    const next = result.alternates.find((p) => !used.has(p.id)) || result.pack.find((p) => !used.has(p.id));
    if (!next) return toast('No more matches to swap in.');
    const out = pack[i];
    pack[i] = next;
    result.alternates = result.alternates.filter((p) => p.id !== next.id).concat(out);
    track('swap', { out: out.handle, in: next.handle, slot: i });
    draw();
    const a = app.querySelector('.qz-cta-box a');
    a && (a.href = bundleUrl());
  }

  function bundleUrl() {
    // The store's bundle builder pre-picks these 50 ml variants and, with checkout=1, goes straight to checkout.
    // Shopify: snippets/scent-quiz-prefill.liquid on the bundle page; root keeps a market folder (/en-gb/).
    if (SHOP) return `${SHOP.root}products/${BUNDLE.handle}?scents=${pack.map((p) => p.variant50.id).join(',')}&checkout=1`;
    return `${LIVE ? '' : STORE}/products/${BUNDLE.handle}?scents=${pack.map((p) => p.variant50.id).join(',')}&checkout=1`;
  }
  // Shopify: a price test app can charge visitors in a test group another bundle price. Same source as the
  // theme's snippets/price-test-card-sync.liquid (window.absolutely); visitors outside a test keep the store price.
  function shopTestPrice() {
    if (!SHOP) return;
    try {
      const groups = window.absolutely?.testGroups, tests = window.absolutelyConfig?.priceTests;
      for (const test of tests || []) {
        const group = (test.groups || []).find((g) => g.id === groups?.[test.id]);
        const v = (group?.variants || []).find((x) => String(x.variantId) === String(SHOP.bundle.variantId));
        if (v && Number(v.price) > 0) BUNDLE.price = Number(v.price);
      }
    } catch (e) {}
  }
  function checkout(e) {
    track('cta_click', { profile: result.profile.name, scents: pack.map((p) => p.handle).join(',') });
    if (LIVE) return;
    e.preventDefault();
    toast('Localhost: on the store this opens checkout with these 6 scents');
    console.log('[scent quiz] bundle link:', bundleUrl());
  }

  function emailBox(s) {
    // The send is a stub until an email list is connected: on the store, no box that would confirm a send that never happens.
    if (LIVE) return null;
    const input = el('input', { type: 'email', required: true, placeholder: 'Your email', autocomplete: 'email', 'aria-label': 'Email' });
    const form = el('form', { class: 'qz-email', novalidate: true },
      el('label', { class: 'qz-email-label' }, 'Email me my scent profile'),
      el('div', { class: 'qz-email-row' }, input, el('button', { type: 'submit', class: 'qz-btn qz-btn--dark' }, 'Send')));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value.trim())) { input.classList.add('is-err'); input.focus(); return; }
      submitLead(input.value.trim(), s);
      form.replaceChildren(el('p', { class: 'qz-email-done' }, `Sent. Your ${result.profile.name} profile is on its way.`));
    });
    return form;
  }
  // Klaviyo wiring goes here (stub). Same client subscribe call as perfume-quiz/index.html submitLead().
  function submitLead(email, s) {
    track('email_submit', { profile: result.profile.name, scents: pack.map((p) => p.title).join(', '), bundle_url: bundleUrl() });
    console.log('LEAD (stub):', email, result.profile.name, bundleUrl());
  }

  // ---------- boot ----------
  // Shopify: data comes inline (assets/scent-quiz-data.js), no fetch.
  const load = (f) => (SHOP && window.SQ_DATA
    ? Promise.resolve(window.SQ_DATA[f.replace('.json', '')] || {})
    : fetch('data/' + f + '?v=4').then((r) => { if (!r.ok) throw new Error(f + ' ' + r.status); return r.json(); }));
  // Shopify: visitor currency, bundle and every scent from the store itself. Scents the store does not sell
  // in 50 ml right now (sold out, unpublished) drop out of the catalog; titles and photos are the store's.
  function shopCatalog(c) {
    CUR = SHOP.currency.toLowerCase();
    Object.assign(BUNDLE, { handle: SHOP.bundle.handle, price: SHOP.bundle.price / 100, compare: SHOP.bundle.compare > SHOP.bundle.price ? SHOP.bundle.compare / 100 : 0 });
    c.products = c.products.filter((p) => SHOP.products[p.id]).map((p) => {
      const s = SHOP.products[p.id];
      return { ...p, title: s.title.replace(/\s*-\s*No\.\s*\d+\s*$/, ''), image: s.image || p.image, variant50: { id: String(s.variant), price: s.price / 100 } };
    });
    return c;
  }
  // On the store: visitor currency + live bundle price. Any failure keeps the USD defaults.
  const market = !LIVE || SHOP ? Promise.resolve() : Promise.all(['/api/geo', '/api/bundle-state', '/markets.json'].map((u) => fetch(u).then((r) => (r.ok ? r.json() : null))))
    .then(([geo, st, mk]) => {
      const cur = geo?.currency, pr = st?.prices?.[cur];
      if (!cur || !pr?.price || (cur !== 'usd' && !mk?.prices?.[cur])) return;
      CUR = cur; MARKETS = mk;
      BUNDLE.price = pr.price / 100; BUNDLE.compare = pr.compare > pr.price ? pr.compare / 100 : 0;
      if (st.handle) BUNDLE.handle = st.handle;
    }).catch(() => {});
  Promise.all([load('quiz.json'), load('profiles.json'), load('catalog.json'), VARIANT === 'us' ? load('designer-prices.json').catch(() => ({})) : {}, market]).then(([q, p, c, d]) => {
    QUIZ = q; PROFILES = p; CATALOG = SHOP ? shopCatalog(c) : c; DESIGNER = d;
    LABELS = { groups: Object.fromEntries(q.questions.notes.answers.map((a) => [a.id, a.title])), families: q.familyLabels, persona: q.personality };
    render();
  }).catch((e) => { app.textContent = 'Could not load the quiz. ' + e.message; });
})();
