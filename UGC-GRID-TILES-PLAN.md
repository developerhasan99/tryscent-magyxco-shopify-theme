# UGC video tiles in the collection grid (magyx.co) — plan

Status: PLAN, waiting for Adrian's go. Written 2026-10-16.
Sister plan for the Whop store: `Documents/dev/magyx-whop/UGC-TILES-PLAN.md`.

## What we are shipping

The "UGC video" grid block from magicperfume.co, made usable on the default
collection template of magyx.co, for desktop and mobile. Adrian adds the
tiles himself in the theme editor: Customize → any collection page → section
"Product grid" → Add block → "UGC video", then sets Position, Show on
(Desktop / Mobile / Both), Video (picker, Shopify Files), optional Poster
image, and Linked product. No clips or positions are hard-coded by us.

Reference, live: https://magicperfume.co/collections/bestseller-1 (template
`collection.collection-lander-v1.json`, three mobile tiles at positions 2,
4, 8, each linked to a bundle). Reference code: repo
`magicperfume-adjusted-theme`, `origin/main` (local `main` is 3 commits
behind, read files with `git show origin/main:<path>`):
`assets/fuel05-ugc.css`, `assets/fuel05-ugc.js`,
`snippets/fuel05-ugc-tile.liquid`, block wiring in
`sections/main-collection-product-grid.liquid` (commit 7e52512).

## What the feature does (so QA knows what "right" looks like)

- One grid cell per block, inserted before product N (N = Position, counted
  among products on page 1 only; the block is skipped on page 2+).
- 9:16 clip, muted, looping. Poster image held over the video until the
  first frame paints. Starts muted when at least half visible, one clip
  plays at a time page-wide. Tap or Enter/Space = play with sound; next tap
  pauses. Clips warm up two at a time after page load.
- Shopify CDN source is rewritten from the 1080p rendition to
  `SD-480p-1.5Mbps` when the filename carries `HD-1080p-7.2Mbps`.
- Desktop (≥750px): tile aspect 260/494, white pill at the bottom with the
  linked product's thumb (66px), title (2-line clamp), price and a plus
  icon; the pill links to the product page.
- Mobile (<750px): tile fills the cell height next to the product cards, no
  pill.
- Tiles survive filter, sort and in-collection search: those re-render the
  grid from the server, and `fuel05-ugc.js` re-arms through a
  MutationObserver on `#ProductGridContainer`.

## Current state on magyx.co (verified 2026-10-16)

- The feature already exists in this theme from Mehedi's September A/B test
  (commits 205d6e1, 1e2716f): same section wiring, snippet, CSS, JS, schema
  block `fuel05_ugc_video` with settings position / device / video /
  video_url / video_poster / product.
- It is dead on live because of three gates: `assets/fuel05-ugc.css` starts
  with `.fuel05-ugc { display: none !important; }` and only shows tiles
  under `html.ab-f05-ugc` (Intelligems) or `.shopify-design-mode`;
  `assets/fuel05-ugc.js` has a `#f05` / `#f05-off` hash-reveal block for
  preview themes; the tile `<li>` in
  `sections/main-collection-product-grid.liquid` (~line 205) carries an
  inline `style="display: none;"`.
- Intelligems is installed on Magic Perfume DE and tryscent.co, not on
  magyx.co. Nothing depends on the gate.
- `templates/collection.json` is the template of all 24 collections
  (Admin API: every collection has an empty `templateSuffix`). Its
  product grid already has a `featured_product` block at position 1 and a
  `quiz_promo_card` block at position 3 (same position loop, rendered in
  block order). 16 products per page, 4 columns desktop, 2 mobile.
- `collection.collection-lander-v1/-v2.json` exist here too but no
  collection uses them. Not touched.
- Five English UGC clips are already in this store's Files (TryScent
  designer anatomy UK 36s, street interview 22s, Bemigho Mike-Ifeta 74s,
  Taylor Reid 55s, Daria Kononenko 22s). Usable for QA; Adrian picks the
  real ones.
- Branch state: `fix/you-save-dynamic` has no unique commits and is one
  Shopify-editor commit behind `origin/main` (5f17cb8). Work starts from
  `origin/main`.

## Changes (4 files, code only; no template JSON)

1. `assets/fuel05-ugc.css`: replace with the reference `origin/main`
   version (the "permanent since 2026-09-30" build: no `!important`, no
   `ab-f05-ugc`, device classes shown by media query). Keep this file's
   line endings. Add one rule for the new "Both" option:
   `.fuel05-ugc--grid-both { display: block; }` at all widths.
2. `assets/fuel05-ugc.js`: replace with the reference version (drops the
   hash-reveal and `keepView` block, keeps the MutationObserver re-arm and
   `shopify:section:load`). After the port: `grep -n "ab-f05\|#f05"`
   must return nothing.
3. `snippets/fuel05-ugc-tile.liquid`: take the reference version, keep the
   English label `Play video` (reference says `Video abspielen`) and the
   English comment text. Net change: `fetchpriority="low"` on the three
   poster `<img>` tags.
4. `sections/main-collection-product-grid.liquid`, two hunks only:
   - tile `<li>` (~205-223): drop the inline `display: none;` so the
     attribute block reads
     `{% if settings.animations_reveal_on_scroll %} data-cascade style="--animation-order: {{ product_position }};" {% endif %}`;
   - schema block `fuel05_ugc_video` (~631): add a third `device` option
     `{"value": "both", "label": "Desktop and mobile"}`. Leave the default
     `desktop`.
   Everything else stays: `quiz_promo_card` and `featured_product`
   branches, `collection-search` renders, the `lazy_load` args on product
   cards, the asset tags outside `#ProductGridContainer` (~138-141).
   Do not copy the reference section wholesale (it lacks the magyx.co
   block types).

Not changed: `templates/collection.json` (Adrian adds blocks in the
editor), `sections/fuel05-ugc-row.liquid`, `snippets/fuel05-ugc-home-row.liquid`,
`snippets/fuel05-ugc-pdp.liquid` (home row / PDP variants, unused on live,
out of scope).

Adding an option value to an existing select is code-only, so the
"schema setting + JSON in one push" sync gotcha does not apply. Adrian's
editor saves come back as `shopify[bot]` commits on `main` as usual.

## Sequence

0. Backups, before any push:
   `git fetch origin`,
   `git tag live-before-ugc-grid-2026-10-16 origin/main && git push origin live-before-ugc-grid-2026-10-16`,
   `git push origin origin/main:refs/heads/backup/pre-ugc-grid-2026-10-16`.
   Record Admin API `theme.files` checksums of the 4 files for the readback.
1. `git switch -c feat/ugc-grid-tiles origin/main`. Apply the 4 changes
   (two parallel agents, see split). `shopify theme check --output json`
   theme-wide, compare offense count with `origin/main` (no new ones).
2. Localhost QA (127.0.0.1:9292): kill stale node on 9292, then
   `shopify theme dev --store 0s0rm0-y1.myshopify.com --port 9292`.
   For QA only, add three temporary blocks to the LOCAL
   `templates/collection.json` (one desktop at 3, one mobile at 2, one
   "both" at 6, using one of the five EN clips and `bundle-6x50-79` as the
   linked product), check at 375 and 1440, then `git checkout
   templates/collection.json` before committing. Stop the dev server
   before every file edit.
3. Commit, `git push origin feat/ugc-grid-tiles`, then fast-forward live:
   `git push origin feat/ugc-grid-tiles:main`. Live in about a minute.
4. Readback: `theme.files` checksums of the 4 files equal local after
   `tr -d '\r'`; `curl -s https://magyx.co/collections/best-sellers | grep -c fuel05`
   is 0 (no blocks yet, so the assets are not even loaded); page renders
   normally.
5. Adrian adds the blocks in the editor. Then:
   `curl -s https://magyx.co/collections/<handle> | grep -o 'fuel05-ugc--grid-[a-z]*' | sort | uniq -c`
   shows his count per device, `grep -o 'SD-480p-1.5Mbps[^"]*'` shows the
   rewritten sources and `curl -sI` on one returns 200.

Rollback: `git revert` the merge commit on `main` and push, or publish the
backup branch/tag. Never `shopify theme push` to the connected theme.

## QA checklist (375 and 1440, a collection with more than 16 products)

- Tiles sit before the configured product positions; mobile blocks only at
  375, desktop only at 1440, "both" at both.
- Poster shows at once, no layout jump; mobile tile is as tall as the
  neighbouring card; desktop tile is 260/494 with the pill.
- Tap plays with sound; tapping another tile pauses the first.
- Pill links to the right product page; price matches the card price.
- Change a filter, a sort, and type in the collection search: tiles come
  back from the server render and still play (observer re-armed).
- Page 2 shows no tiles.
- Console clean; the video request ends in `SD-480p-1.5Mbps` and returns
  200 or 206.
- No em dashes in any visible string.

## Risks and notes

- Breakpoint: the tile CSS swaps desktop/mobile at 750px while the Dawn
  grid goes 2 → 4 columns at 990px, so tablets 750–989 show the desktop
  tile (ratio + pill) in a 2-column grid. Same as the reference; left as
  is for parity. Change only if Adrian sees it on a tablet.
- The 480p rewrite depends on the `HD-1080p-7.2Mbps` filename pattern.
  Clips encoded differently stream the picked rendition unchanged. Check
  each real clip's source URL once (`curl -I`) after Adrian picks them.
- Position counts products, not cells, and only page 1. A tile at a
  position larger than the product count never renders. Two blocks at the
  same position render in block order (the quiz card is at 3 today).
- Mobile cell height follows the tallest neighbour; next to the quiz card
  or the featured product the tile may look different from next to a
  plain card. Check once at 375.
- `animations_reveal_on_scroll`: the tile gets Dawn's `scroll-trigger`
  classes like every card. The reference does the same.
- Editor saves by Adrian or Mehedi land on `main` as bot commits; `git
  fetch` and merge before every push.
- Once the gate is gone, any `fuel05_ugc_video` block anywhere shows at
  once. Only collection.json gets blocks (by Adrian).

## Agent split for execution

- Agent A (files: `assets/fuel05-ugc.css`, `assets/fuel05-ugc.js`): port
  from the reference, add the `--grid-both` rule, keep line endings.
  Verify: diff against the reference after EOL normalisation shows only
  the one added rule; grep checks pass.
- Agent B (files: `snippets/fuel05-ugc-tile.liquid`,
  `sections/main-collection-product-grid.liquid`): snippet port with
  English label kept, the two section hunks. Verify: `git diff` shows only
  those hunks; theme check clean versus baseline.
- Then serial in the main loop: backups, theme check, localhost QA with
  temporary blocks (reverted), commit, push, readback.
