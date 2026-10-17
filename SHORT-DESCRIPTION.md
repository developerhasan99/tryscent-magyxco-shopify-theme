# Short description under the product title (magyx.co)

Live since 17.10.2026 (commit ee4aa82).

## What shows
On the product page, directly under the title and the rating:
1. the product's short description (1-2 sentences);
2. an underlined uppercase link **FULL DESCRIPTION**, which opens the "Description" accordion further down and scrolls to it.

Nothing shows while the field is empty. The theme editor shows a dashed placeholder instead.

The old "Full description" link in `snippets/scent-profiling.liquid` opened Fragrance notes, not the description. It was removed with this change. "Clean label" next to it is unchanged; its target section no longer exists on the page.

## Where the text lives
- Product metafield `custom.short_description`, type `multi_line_text_field`. The definition "Short description" exists, is pinned on the product page in admin, and has storefront read access.
- `custom.scent_description`, printed in scent-profiling, is a different, older field. It is empty on every product; leave it.
- Edit the text in Admin → Products → product → Metafields → Short description, or through the Admin API (below).

## Rules for the text
- English.
- 1-2 sentences, at most 220 characters.
- Plain text, no HTML. A line break in the field becomes a line break on the page.
- No prices or currency. The store sells in USD, EUR, GBP, CAD and AUD.
- No em dashes (—).
- No designer brand names ("Inspired by" already shows the original).
- Only what the product's own data says: family, character, notes, set contents. No new claims about longevity, concentration or health. "Up to 12 hours" and "up to 21% perfume oil" are fine; they are on the page already.

## Write or change it (Admin GraphQL)
```graphql
mutation {
  metafieldsSet(metafields: [{
    ownerId: "gid://shopify/Product/<id>",
    namespace: "custom",
    key: "short_description",
    type: "multi_line_text_field",
    value: "A crisp aquatic scent with cool marine freshness and smooth woods."
  }]) { metafields { id } userErrors { field message } }
}
```
To hide it again, delete the metafield (`metafieldsDelete` with ownerId, namespace, key). An empty value is rejected.

## Where it is wired (theme)
- `snippets/short-description.liquid`: markup. It is the same file as in the tryscent.eu theme.
- `assets/mgx-sdesc.css`, `assets/mgx-sdesc.js`: style and the link's open-and-scroll.
- `sections/main-product.liquid`: block `short_description`, rendered in the first block loop. The accordions render in the second loop. Settings: link label, and the id of the accordion block to open (`collapsible_tab_XYmgtQ`).
- Templates:
  - `product.quantity-breakers.json` (80 perfumes), after the rating.
  - `product.custom-bundle.json` (11 bundles), after the title.

## Message for GrokBot (paste)
> On magyx.co every product has a new field "Short description" (metafield `custom.short_description`, type `multi_line_text_field`). Its text shows on the product page under the title and rating, followed by a "FULL DESCRIPTION" link to the full description. Empty means nothing shows. Rules: English, 1-2 sentences, max 220 characters, plain text without HTML, no prices or currency, no em dashes (—), no designer brand names, only facts from the product's own data (scent family, character, notes, set contents). Write with `metafieldsSet` (product ownerId, namespace `custom`, key `short_description`, type `multi_line_text_field`). Remove with `metafieldsDelete`.
