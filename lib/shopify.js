// Shopify Admin API helpers — one brand at a time
const API_VERSION = '2024-01';

function shopifyFetch(shopDomain, accessToken, path, options = {}) {
  const url = `https://${shopDomain}/admin/api/${API_VERSION}${path}`;
  return fetch(url, {
    ...options,
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
}

async function getOrder(shopDomain, accessToken, orderId) {
  const r = await shopifyFetch(shopDomain, accessToken, `/orders/${orderId}.json?fields=id,name,email,phone,financial_status,fulfillment_status,line_items,shipping_address,total_price,created_at`);
  if (!r.ok) throw new Error(`Shopify order fetch failed: ${r.status}`);
  const d = await r.json();
  return d.order;
}

async function getOrders(shopDomain, accessToken, params = '') {
  const r = await shopifyFetch(shopDomain, accessToken, `/orders.json?status=any&limit=50${params ? '&' + params : ''}`);
  if (!r.ok) throw new Error(`Shopify orders fetch failed: ${r.status}`);
  const d = await r.json();
  return d.orders || [];
}

async function registerWebhook(shopDomain, accessToken, topic, address) {
  const r = await shopifyFetch(shopDomain, accessToken, '/webhooks.json', {
    method: 'POST',
    body: JSON.stringify({ webhook: { topic, address, format: 'json' } }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(`Webhook register failed (${topic}): ${JSON.stringify(d)}`);
  return d.webhook;
}

async function listWebhooks(shopDomain, accessToken) {
  const r = await shopifyFetch(shopDomain, accessToken, '/webhooks.json');
  if (!r.ok) throw new Error(`Webhook list failed: ${r.status}`);
  const d = await r.json();
  return d.webhooks || [];
}

async function deleteWebhook(shopDomain, accessToken, webhookId) {
  await shopifyFetch(shopDomain, accessToken, `/webhooks/${webhookId}.json`, { method: 'DELETE' });
}

const WEBHOOK_TOPICS = ['orders/create', 'orders/updated', 'fulfillments/create', 'fulfillments/update'];

async function registerAllWebhooks(shopDomain, accessToken, baseUrl) {
  const results = [];
  for (const topic of WEBHOOK_TOPICS) {
    const slug = topic.replace('/', '-');
    const address = `${baseUrl}/webhooks/${slug}`;
    try {
      const wh = await registerWebhook(shopDomain, accessToken, topic, address);
      results.push({ topic, id: wh.id, ok: true });
    } catch (e) {
      results.push({ topic, ok: false, error: e.message });
    }
  }
  return results;
}

module.exports = { shopifyFetch, getOrder, getOrders, registerWebhook, listWebhooks, deleteWebhook, registerAllWebhooks };
