import { readBlockConfig } from '../../scripts/aem.js';
import { CS_FETCH_GRAPHQL, getProductLink } from '../../scripts/commerce.js';

/**
 * @param {{ attribute: string, eq: string }[]} filter
 * @param {number} pageSize
 */
async function fetchCategoryProducts(filter, pageSize) {
  const query = `
    query GetCategoryProducts($filter: [SearchClauseInput!]!, $pageSize: Int!) {
      productSearch(phrase: "", filter: $filter, page_size: $pageSize) {
        items {
          productView {
            __typename
            name
            sku
            urlKey
            images(roles: ["image"]) {
              url
              label
            }
            ... on SimpleProductView {
              price {
                final {
                  amount {
                    value
                    currency
                  }
                }
              }
            }
            ... on ComplexProductView {
              priceRange {
                minimum {
                  final {
                    amount {
                      value
                      currency
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  const { data, errors } = await CS_FETCH_GRAPHQL.fetchGraphQl(query, {
    method: 'GET',
    variables: { filter, pageSize },
  });

  if (errors?.length) {
    const message = errors.map((e) => e.message).join('; ');
    throw new Error(message || 'GraphQL error');
  }

  return data?.productSearch?.items || [];
}

function extractDisplayPrice(productView) {
  if (!productView) return null;
  const simple = productView.price?.final?.amount;
  if (simple?.value != null) return simple;
  const range = productView.priceRange?.minimum?.final?.amount;
  if (range?.value != null) return range;
  return null;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default async function decorate(block) {
  const config = readBlockConfig(block);
  const categoryId = config['category-id'] ?? '';
  const categoryPath = config['url-path'] ?? config.urlpath ?? '';
  const heading = config.heading ?? 'Featured Products';
  const maxProductsStr = config['max-products'] ?? config.maxproducts ?? '4';

  const maxProducts = parseInt(maxProductsStr, 10) || 4;

  block.innerHTML = `
    <div class="promo-banner__heading">
      <h2>${escapeHtml(heading)}</h2>
    </div>
    <div class="promo-banner__products">
      <p class="promo-banner__status">Loading products...</p>
    </div>
  `;

  const productsContainer = block.querySelector('.promo-banner__products');
  if (!productsContainer) return;

  const filter = categoryPath
    ? [{ attribute: 'categoryPath', eq: categoryPath }]
    : categoryId
      ? [{ attribute: 'categoryIds', eq: String(categoryId) }]
      : null;

  if (!filter) {
    productsContainer.innerHTML = '<p class="promo-banner__status">Add a <strong>Category ID</strong> or <strong>URL Path</strong> in the block configuration.</p>';
    return;
  }

  try {
    const items = await fetchCategoryProducts(filter, maxProducts);

    if (items.length === 0) {
      productsContainer.innerHTML = '<p class="promo-banner__status">No products found.</p>';
      return;
    }

    productsContainer.replaceChildren();

    items.forEach((item) => {
      const product = item.productView;
      if (!product?.sku) return;

      const link = document.createElement('a');
      link.className = 'promo-banner__product';
      link.href = getProductLink(product.urlKey, product.sku);

      const image = product.images?.[0];
      if (image?.url) {
        const img = document.createElement('img');
        img.src = image.url.startsWith('//') ? `https:${image.url}` : image.url;
        img.alt = image.label || product.name || '';
        img.loading = 'lazy';
        img.width = 300;
        img.height = 300;
        link.appendChild(img);
      }

      const name = document.createElement('span');
      name.className = 'promo-banner__product-name';
      name.textContent = product.name || '';
      link.appendChild(name);

      const price = extractDisplayPrice(product);
      if (price?.value != null) {
        const priceEl = document.createElement('span');
        priceEl.className = 'promo-banner__product-price';
        const currency = price.currency || '';
        priceEl.textContent = `${currency} ${Number(price.value).toFixed(2)}`.trim();
        link.appendChild(priceEl);
      }

      productsContainer.appendChild(link);
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Promo banner: failed to fetch products', error);
    productsContainer.innerHTML = '<p class="promo-banner__status">Unable to load products.</p>';
  }
}
