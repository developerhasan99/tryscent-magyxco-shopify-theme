// Scent quiz scoring. Pure functions: answers + catalog + profiles + quiz config -> recommendation.
// Runs in the browser (window.ScentScore) and in Node (require) for scripts/simulate.mjs.
(function (root) {
  const W = { family: 0.45, notes: 0.3, occasion: 0.12, intensity: 0.08, best: 0.05, avoid: 0.2 };
  const POOL = 0.8; // pack candidates must score within 80% of the best match (wider only if too few)
  const PACK = 6;

  const dot = (a, b) => Object.keys(a).reduce((s, k) => s + a[k] * (b[k] || 0), 0);
  const len = (a) => Math.sqrt(dot(a, a)) || 1;
  const cosine = (a, b) => dot(a, b) / (len(a) * len(b));
  const primary = (vec) => Object.keys(vec).reduce((m, k) => (vec[k] > (vec[m] || 0) ? k : m), '');

  function profileKey(a) {
    return a.gender === 'female' ? `${a.scents}.${a.mood}.${a.energy}` : `${a.scents}.${a.scents === 'sophisticated' ? a.mood : a.energy}`;
  }

  // Gender filter: own gender always; anything tagged unisex (e.g. ["men","unisex"]) only when unisex is welcome.
  // "No unisex" still keeps ["women","unisex"] scents for women: they are feminine first.
  function eligible(p, a) {
    const want = a.gender === 'female' ? 'women' : 'men';
    if (p.gender.includes(want)) return true;
    return a.unisex !== 'no' && p.gender.includes('unisex');
  }

  function scoreProduct(p, a, prof, feel) {
    const target = { ...prof.families };
    for (const [f, w] of Object.entries(feel?.families || {})) target[f] = (target[f] || 0) + w;
    const fam = cosine(target, p.familyVec);

    // User-picked notes count double, the profile's own notes fill in.
    const picked = a.notes || [];
    const wanted = [...picked.map((g) => [g, 2]), ...prof.notes.filter((g) => !picked.includes(g)).map((g) => [g, 1])];
    const wsum = wanted.reduce((s, [, w]) => s + w, 0) || 1;
    const notes = wanted.reduce((s, [g, w]) => s + w * (p.noteGroups[g] || 0), 0) / wsum;

    const occ = !p.occasion.length ? 0.35 : p.occasion.some((o) => feel?.occasion.includes(o)) ? 1 : 0;
    const inten = 1 - Math.abs((p.intensity ?? 0.5) - prof.intensity);
    const best = p.bestseller && p.bestseller <= 10 ? 1 : p.bestseller && p.bestseller <= 25 ? 0.5 : 0;

    const avoid = Math.max(0, ...(prof.avoid || []).map((f) => p.familyVec[f] || 0));
    const score = W.family * fam + W.notes * notes + W.occasion * occ + W.intensity * inten + W.best * best - W.avoid * avoid;
    const hits = wanted.map(([g]) => g).filter((g) => (p.noteGroups[g] || 0) >= 0.3);
    return { p, score, fam, notes, hits, pickedHits: hits.filter((g) => picked.includes(g)) };
  }

  // Both habits pick from the close-match pool only. Shifter: varied wardrobe (penalise bottles that smell like
  // one already in the pack). Spritzer: best match + its closest cousins.
  function buildPack(ranked, habit) {
    if (!ranked.length) return [];
    const top = ranked[0].score;
    let pool = ranked.slice(1).filter((r) => r.score >= POOL * top);
    if (pool.length < PACK - 1) pool = ranked.slice(1, Math.max(PACK + 3, pool.length + 1));
    const sim = (a, b) => 0.6 * cosine(a.p.familyVec, b.p.familyVec) + 0.4 * cosine(a.p.noteGroups, b.p.noteGroups);
    const pack = [ranked[0]];
    while (pack.length < PACK && pool.length) {
      let bi = 0, bv = -Infinity;
      pool.forEach((r, i) => {
        const v = habit === 'spritzer'
          ? 0.6 * r.score + 0.4 * sim(pack[0], r) * top
          : r.score - 0.25 * top * Math.max(...pack.map((x) => sim(x, r)));
        if (v > bv) { bv = v; bi = i; }
      });
      pack.push(pool.splice(bi, 1)[0]);
    }
    return pack;
  }

  // "Why we picked this" lines speak to the customer's own answers (how they want to feel, their mood, the notes
  // they picked, how they wear scent), with the scent's real notes as proof. Card i leads with a different answer,
  // so six cards never read the same. The best match gets the long two-sentence version.
  const sentence = (t) => t[0].toUpperCase() + t.slice(1);
  function reasons(r, a, L) {
    const P = L.persona, g = a.gender;
    const out = [];
    const picked = r.pickedHits.map((x) => L.groups[x].replace(/\s*\(.*\)/, '').toLowerCase());
    if (picked.length) out.push({ kind: 'picked', text: list(picked) });
    if (P.feel[g]?.[a.feel]) out.push({ kind: 'feel', text: P.feel[g][a.feel] });
    for (const k of g === 'female' ? ['energy', 'mood', 'scents'] : [a.scents === 'sporty' ? 'energy' : 'mood', 'scents']) {
      const t = P.trait[g]?.[`${k}.${a[k]}`];
      if (t) out.push({ kind: 'trait', text: t });
    }
    const occ = r.p.occasion.find((o) => P.occasion[o]);
    if (occ) out.push({ kind: 'occasion', text: P.occasion[occ] });
    if (P.habit[a.habit]) out.push({ kind: 'habit', text: P.habit[a.habit] });
    out.push({ kind: 'vibe', text: '' });
    return out;
  }
  function proofNotes(r, skip) {
    const n = r.p.notes, seen = new Set();
    // One note from each layer reads like the scent opening, settling and lasting.
    return [n.top[0], n.base[0], n.heart[0], ...n.base.slice(1), ...n.heart.slice(1)]
      .filter((x) => x && !seen.has(x) && seen.add(x) && !skip.some((s) => x.includes(s.split(' ')[0])));
  }
  function why(r, a, L, idx, long) {
    if (!L?.persona) return '';
    const vibe = L.persona.vibe[primary(r.p.familyVec)] || 'just right';
    const rs = reasons(r, a, L);
    const picked = rs.find((x) => x.kind === 'picked');
    const notes = proofNotes(r, picked ? picked.text.split(/, | and /) : []);
    const [n1, n2, n3] = notes;
    if (long) {
      const feel = rs.find((x) => x.kind === 'feel'), trait = rs.find((x) => x.kind === 'trait');
      const first = feel && trait ? `You want to feel ${feel.text}, and ${trait.text}.` : trait ? `${sentence(trait.text)}.` : '';
      const occ = rs.find((x) => x.kind === 'occasion');
      const proof = n1 ? `${r.p.title} gets you there: ${list([n1, n2, n3].filter(Boolean))} that keep you ${vibe}${occ ? `, made for ${occ.text}` : ''}.` : '';
      return [first, proof, picked ? `And it carries the ${picked.text} you picked.` : ''].filter(Boolean).join(' ');
    }
    const pair = list([n1, n2].filter(Boolean)) || 'its blend';
    const x = rs[idx % rs.length];
    if (!x) return `${sentence(pair)}, ${vibe}.`;
    if (x.kind === 'picked') return `You picked ${x.text}. Here it meets ${pair} for a ${vibe} finish.`;
    if (x.kind === 'feel') return `For the ${x.text} side of you: ${pair}, ${vibe}.`;
    if (x.kind === 'trait') return `Because ${x.text}: ${pair} keep you ${vibe}.`;
    if (x.kind === 'occasion') return `Your pick for ${x.text}: ${pair}, ${vibe}.`;
    if (x.kind === 'vibe') return `${sentence(vibe)} from the first spray: ${pair}.`;
    return `${sentence(x.text)}: ${pair}, ${vibe}.`;
  }
  const list = (xs) => (xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1]);

  function recommend(answers, catalog, profiles, quiz, labels) {
    const key = profileKey(answers);
    const prof = profiles[answers.gender]?.[key];
    if (!prof) throw new Error('No profile for ' + answers.gender + ' ' + key);
    const feel = quiz.feelOccasions[answers.gender]?.[answers.feel];
    const ranked = catalog.products.filter((p) => eligible(p, answers)).map((p) => scoreProduct(p, answers, prof, feel)).sort((x, y) => y.score - x.score);
    const built = buildPack(ranked, answers.habit);
    const pack = [built[0], ...built.slice(1).sort((x, y) => y.score - x.score)]; // best first, then by match
    const top = ranked[0]?.score || 1;
    const match = (r) => Math.min(99, Math.round(72 + 27 * Math.pow(r.score / top, 2)));

    // Family and note bars describe the pack the customer actually gets.
    const famSum = {}, noteSum = {};
    for (const r of pack) {
      for (const [f, w] of Object.entries(r.p.familyVec)) famSum[f] = (famSum[f] || 0) + w;
      for (const [g, w] of Object.entries(r.p.noteGroups)) noteSum[g] = (noteSum[g] || 0) + w;
    }
    for (const g of answers.notes || []) noteSum[g] = (noteSum[g] || 0) + 2;
    const famTop = Math.max(...Object.values(famSum), 1);
    const families = Object.entries(famSum).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([f, w]) => ({ id: f, pct: Math.round((100 * w) / famTop) }));
    const notes = Object.entries(noteSum).sort((x, y) => y[1] - x[1]).slice(0, 6).map(([g]) => g);

    const out = (r, i) => ({ ...r.p, score: +r.score.toFixed(4), match: match(r), why: why(r, answers, labels, i, false), whyLong: i === 0 ? why(r, answers, labels, 0, true) : '' });
    const rest = ranked.filter((r) => !pack.includes(r));
    return { key, profile: prof, families, notes, best: out(pack[0], 0), pack: pack.map(out), alternates: rest.slice(0, 12).map((r, i) => out(r, i + 1)), all: ranked.map((r, i) => out(r, i + 1)) };
  }

  const api = { recommend, profileKey, eligible, cosine, primary, PACK };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ScentScore = api;
})(typeof window !== 'undefined' ? window : globalThis);
