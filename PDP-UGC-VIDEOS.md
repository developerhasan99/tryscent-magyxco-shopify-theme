# UGC video row on product and bundle pages (magyx.co)

Port of the tryscent.eu "Wideo UGC" row (live there 17.10.2026; notes in
that repo's `PDP-UGC-VIDEOS.md`). Same files, English copy.

## What it is
Block "UGC videos" (`ugc_videos`, limit 1) in `sections/main-product.liquid`:
up to three portrait clips in one row at 9:16, an optional caption under each,
a white product card on every clip (photo, title, price) and a full-screen
player with sound (native `<dialog>`) carrying the same card. The preview
plays the clips in view one after another without sound (hover, focus and a
keyboard-only pause button stop it; reduced motion turns it off).

Per slot: video from Files or a direct .mp4 link, optional cover, caption +
show/hide, product. An empty product means this page's own product: the card
then scrolls to the offer instead of reloading. Products that cannot be
bought get no card.

## Placement
- `product.quantity-breakers` (80 products): after the comparative
  advertising disclaimer tab, products = `bundle-6x50-71`.
- `product.custom-bundle` (11 bundles): same place, no product, so each card
  shows that page's bundle. `bundle-3x100-79` is sold out, so no card there.
- Not placed: `product.json` (no visible product), `payday-60` (main off).
  The block can be added there in Customize.
- Clips 1-3 (both templates): Cecilie T, Molly S, Allie K from Files; Bea K
  is in Files as a spare. Captions: "Smells like the designer", "Lasts 12+
  hours", "High-quality ingredients".

## Differences from tryscent.eu
- magyx.co renders the FAQ tabs in a second block loop in main-product, after
  every other block. The `ugc_videos` branch lives in that second loop, so
  the row sits under the tabs; in the first loop it would render above them
  whatever the block order says.
- No "Polecany zestaw" card on this store, so no `replace_bundle` setting.
- Titles print with `title | escape` (no Polish title snippet here).
- Scroll anchors: `id="atc_scroll_target"` on `.atc-bundle-builder`
  (bundle offer) and on the outer div of `snippets/quantity-breaker.liquid`.
  The row's JS scrolls to `#atc_scroll_target, .bundle-price-pdp`, first in
  page order, so bundles with the `Bundle_Price_Show` tag land on the price.
- Reduced motion scrolls with `behavior: 'instant'`: base.css sets
  `html { scroll-behavior: smooth }`, which `'auto'` follows.
- `snippets/ugc-video-src.liquid` repeats the rendition picker that is still
  inline in `fuel05-ugc-tile.liquid` (grid tiles left untouched).

## Files
`snippets/ugc-video-row.liquid`, `snippets/ugc-video-count.liquid`,
`snippets/ugc-video-src.liquid`, `assets/ugc-video-row.css`,
`assets/ugc-video-row.js`, `sections/main-product.liquid`,
`snippets/quantity-breaker.liquid`, `templates/product.quantity-breakers.json`,
`templates/product.custom-bundle.json`.

## Changing clips
Customize -> product template "quantity-breakers" (or "custom-bundle") ->
UGC videos -> Video 1-3. Each template has its own clips.

## QA (2026-10-17, preview theme 189360701592 on 127.0.0.1:9296, then live)
Product page `no-247` and bundles `bundle-6x50-71`, `3-x-50ml-perfume-starter-pack-40`,
`6-x-50ml-perfume-wardrobe-55` at 375 / 820 / 1024 / 1440: three 9:16 clips
in one row (110x195 phone, 98x174 at 820, 135x241 at 1024, 165x293 desktop),
15px under the last FAQ tab, cards inside the clips, titles unclamped. The
product page card opens `/products/bundle-6x50-71`; on bundle pages the card
and the player's card stop at the price 12px under the sticky header without
a reload. The player opens with sound on a real click; Esc, backdrop and X
close it and focus returns. `bundle-3x100-79` (sold out): clips, no card. No
clips: no row, no gap, no CSS loaded. The preview plays only the clip in view,
muted. Theme check: no new offenses. Review: three reviewers + verifiers, one
confirmed finding (missing top margin under the tabs), fixed.

Live (www.magyx.co): Admin API checksums of all nine theme files = repo; all
79 published quantity-breakers pages and all 11 bundle pages render one row
with three clips (bundle-3x100-79 without cards), one `#atc_scroll_target`,
no new Liquid error; the browser QA above passes on live in USD.

Pre-existing, not changed: `sections/image-and-text` prints "Liquid error:
invalid url input" twice on product and bundle pages (section image missing
in the templates), on the old live too.

## Go-live and rollback
Done 2026-10-17: tag `live-before-pdp-ugc-2026-10-17` and branch
`backup/live-before-pdp-ugc-2026-10-17` (= ddcec4b) on the remote, live
theme pulled to `Documents/dev/_backups/magyxco-live-2026-10-17/` (630 files)
and uploaded as unpublished theme 189361389720 "BACKUP live 2026-10-17
(before UGC videos)", then `git push origin feat/pdp-ugc-videos:main`
(fast-forward, 7dedccc). Rollback: publish theme 189361389720 in the admin,
or `git revert` the commit and push to main.
