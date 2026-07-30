import { readBlockConfig } from '../../scripts/aem.js';
import { CS_FETCH_GRAPHQL } from '../../scripts/commerce.js';

// Best-practice split:
//  - Catalog data (image/name/sku/price) comes DIRECT from Catalog Service via
//    CS_FETCH_GRAPHQL — the optimized storefront read path (same as PDP/promo-banner).
//    Catalog reads do NOT go through the mesh (that's the "legacy Mesh" anti-pattern).
//  - Enrichment data (sustainability score, delivery) comes from the API Mesh, which
//    is what a mesh is actually for: exposing custom/aggregated backend data.
const MESH_ENDPOINT = 'https://edge-sandbox-graph.adobe.io/api/944322b4-2dca-4af2-bdf2-4d8b239020d4/graphql';

const PRODUCT_CARD_QUERY = `
  query EnrichedProductCard($skus: [String]) {
    products(skus: $skus) {
      __typename
      sku
      name
      images(roles: ["image"]) {
        url
        label
      }
      ... on SimpleProductView {
        price { final { amount { value currency } } }
      }
      ... on ComplexProductView {
        priceRange { minimum { final { amount { value currency } } } }
      }
    }
  }
`;

const ENRICHMENT_QUERY = `
  query ProductEnrichment($sku: String!) {
    Enrichment_getProductEnrichment(sku: $sku) {
      sku
      sustainabilityScore
      estimatedDelivery
    }
  }
`;

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function imageSrc(url) {
  if (!url) return '';
  if (url.startsWith('//')) return `https:${url}`;
  if (/^https?:/i.test(url)) return url;
  return `https://${url.replace(/^\/+/, '')}`;
}

function extractDisplayPrice(product) {
  if (!product) return null;
  const simple = product.price?.final?.amount;
  if (simple?.value != null) return simple;
  const range = product.priceRange?.minimum?.final?.amount;
  if (range?.value != null) return range;
  return null;
}

// Map a 0-100 sustainability score to a badge tier (matches .badge--* in the CSS).
// Thresholds are a UX choice — tweak freely.
function badgeClass(score) {
  if (score >= 85) return 'badge--excellent';
  if (score >= 70) return 'badge--good';
  return 'badge--fair';
}

// Catalog data — direct Catalog Service (best-practice storefront read path).
async function fetchProductCard(sku) {
  const { data, errors } = await CS_FETCH_GRAPHQL.fetchGraphQl(PRODUCT_CARD_QUERY, {
    method: 'GET',
    variables: { skus: [sku] },
  });
  if (errors?.length) {
    throw new Error(errors.map((e) => e.message).join('; ') || 'GraphQL error');
  }
  const list = data?.products;
  return Array.isArray(list) && list.length ? list[0] : null;
}

// Enrichment — via the API Mesh. Optional: a failure here must NOT break the card.
async function fetchEnrichment(sku) {
  try {
    const res = await fetch(MESH_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: ENRICHMENT_QUERY, variables: { sku } }),
    });
    if (!res.ok) return null;
    const { data } = await res.json();
    return data?.Enrichment_getProductEnrichment || null;
  } catch (e) {
    console.warn('Enrichment fetch failed (card renders without it):', e);
    return null;
  }
}

export default async function decorate(block) {
  const { sku: rawSku } = readBlockConfig(block);
  const sku = rawSku != null ? String(rawSku).trim() : '';

  if (!sku) {
    block.innerHTML = '<p>No SKU configured for this block.</p>';
    return;
  }

  block.innerHTML = '<p>Loading product details...</p>';

  try {
    // Required catalog + optional enrichment, in parallel.
    const [product, enrichment] = await Promise.all([
      fetchProductCard(sku),
      fetchEnrichment(sku),
    ]);

    if (!product) {
      block.innerHTML = '<p>Product not found.</p>';
      return;
    }

    const price = extractDisplayPrice(product);
    const image = product.images?.[0];
    const imgUrl = image ? imageSrc(image.url) : '';
    const imgAlt = escapeHtml(image?.label || product.name || '');

    let enrichmentHtml = '';
    if (enrichment) {
      const score = enrichment.sustainabilityScore;
      const scorePart = score != null
        ? `<span class="sustainability-badge ${badgeClass(score)}">Sustainability: ${escapeHtml(score)}</span>`
        : '';
      const deliveryPart = enrichment.estimatedDelivery
        ? `<p class="enriched-product__delivery">Estimated delivery: ${escapeHtml(enrichment.estimatedDelivery)}</p>`
        : '';
      if (scorePart || deliveryPart) {
        enrichmentHtml = `<div class="enriched-product__enrichment">${scorePart}${deliveryPart}</div>`;
      }
    }

    block.innerHTML = `
      <div class="enriched-product__card">
        ${imgUrl ? `<img src="${escapeHtml(imgUrl)}" alt="${imgAlt}" loading="lazy" width="400" height="400" />` : ''}
        <div class="enriched-product__info">
          <h3>${escapeHtml(product.name || '')}</h3>
          <p class="enriched-product__sku">SKU: ${escapeHtml(product.sku || sku)}</p>
          ${price ? `<p class="enriched-product__price">${escapeHtml(price.currency)} ${Number(price.value).toFixed(2)}</p>` : ''}
          ${enrichmentHtml}
        </div>
      </div>
    `;
  } catch (error) {
    console.error('Enriched product block failed:', error);
    block.innerHTML = '<p>Unable to load product data.</p>';
  }
}
