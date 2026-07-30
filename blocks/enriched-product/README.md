# Enriched Product Block

## Overview

The Enriched Product block renders a single product card that combines two backends using each one's best-practice path:

- **Catalog data** (image, name, SKU, price) is read **directly from Catalog Service** via `CS_FETCH_GRAPHQL` — the optimized storefront read path, the same one the PDP and promo-banner blocks use. Catalog reads deliberately do **not** go through API Mesh.
- **Enrichment data** (sustainability score, estimated delivery) is read from the **API Mesh** (`Enrichment_getProductEnrichment`), which surfaces the custom App Builder / I/O Runtime action. This is what a mesh is actually for: exposing custom/aggregated backend data.

The two fetches run in parallel; enrichment is optional and never blocks the card.

## Configuration Options

Block configuration is read via `readBlockConfig(block)`. Authored as a DA.live key-value table.

| Option | Effect |
|--------|--------|
| `sku` | The product SKU to render (e.g. `ACM-3030`). Required — without it the block shows "No SKU configured". |

## Integration

### Catalog Service (catalog data)

`fetchProductCard()` calls `CS_FETCH_GRAPHQL.fetchGraphQl(PRODUCT_CARD_QUERY, { method: 'GET', variables: { skus: [sku] } })`. The `commerce.js` client already carries the required catalog headers, so the block sends none itself.

### API Mesh (enrichment data)

`fetchEnrichment()` does a `POST` to `MESH_ENDPOINT` (top of `enriched-product.js`) querying only `Enrichment_getProductEnrichment(sku)`. Because this is a cross-origin browser call, the mesh must return CORS headers — see `responseConfig.CORS` in the App Builder project's `mesh.json` (`aio api-mesh update mesh.json` after changing it).

### URL Parameters / Events / Local Storage

None used.

## Behavior Patterns

1. Reads `sku`; if absent, renders a prompt and returns.
2. Shows a `Loading product details...` placeholder.
3. Fetches catalog (required) and enrichment (optional) in parallel via `Promise.all`.
4. Renders the product card. When enrichment is present, appends an `.enriched-product__enrichment` section with a `.sustainability-badge` (tier via `badgeClass`: excellent ≥85, good ≥70, else fair) and an estimated-delivery line.

## Error Handling

- **Catalog fetch fails / product missing** → renders `Product not found.` (or `Unable to load product data.` on a thrown error).
- **Enrichment fetch fails** → swallowed (logged as a warning); the card still renders without the enrichment section. Enrichment is additive, never fatal.
