# Promo Banner Block

## Overview

The Promo Banner block is a lightweight, data-driven custom Commerce block. It renders a heading and a grid of product cards (image, name, price, link to PDP) for a given category, fetching live data from Adobe Commerce via the Catalog Service GraphQL `productSearch` query. It is authored and configured entirely through a DA.live key-value table — no code changes are needed to change the category, heading, or product count.

## Configuration Options

Block configuration is read via `readBlockConfig(block)`. Table keys are lowercased and hyphenated automatically (e.g. `Max Products` → `max-products`).

| Option | Effect |
|--------|--------|
| `url-path` (or `urlpath`) | Category URL key. When set, the block filters by `categoryPath` — the attribute this catalog indexes for category browse. **Preferred.** |
| `category-id` | Numeric category id. Used only when `url-path` is absent; filters by `categoryIds` (expects a numeric id such as `13`, not a url key). |
| `heading` | Heading text shown above the grid. Defaults to `Featured Products`. |
| `max-products` (or `maxproducts`) | Number of products to fetch/show. Defaults to `4` if not set or invalid. |

If neither `url-path` nor `category-id` is provided, the block renders a prompt asking the author to add one.

## Integration

### GraphQL

Fetches through the pre-configured `CS_FETCH_GRAPHQL` instance from `scripts/commerce.js` (Catalog Service client with endpoint, headers, and auth already set up). The `productSearch` query is issued with `method: 'GET'` and variables `{ filter, pageSize }`, requesting `SimpleProductView` (`price.final`) and `ComplexProductView` (`priceRange.minimum.final`) shapes plus the `image`-role image.

Product links are built with `getProductLink(urlKey, sku)` from `scripts/commerce.js`, so URLs honor the storefront's path configuration.

### URL Parameters

This block does not read or write URL parameters.

### Events

This block does not emit or listen for events.

### Local Storage

This block does not use localStorage.

## Behavior Patterns

1. **Render shell**: Immediately renders the heading and a `Loading products...` status while data is fetched.
2. **Build filter**: Prefers `categoryPath` (from `url-path`); falls back to `categoryIds` (from `category-id`). With neither, shows a configuration prompt and returns.
3. **Fetch + render**: Calls `fetchCategoryProducts(filter, maxProducts)`, then replaces the status with product cards. Each card links to the PDP and shows image (if present), name, and formatted price. Price is resolved by `extractDisplayPrice`, which handles both simple (`price.final`) and complex (`priceRange.minimum.final`) products.
4. **Text safety**: The authored heading is escaped via `escapeHtml` before injection.

## Error Handling

- **GraphQL errors**: `fetchCategoryProducts` throws when the response contains an `errors` array; the `decorate` catch block logs `console.error('Promo banner: failed to fetch products', error)` and shows `Unable to load products.`
- **No results**: When `productSearch` returns zero items, the block shows `No products found.` (commonly a wrong/empty category filter or unsynced Catalog Service data).
- **Missing configuration**: With no `url-path` or `category-id`, the block shows a prompt to add one rather than issuing a query.
