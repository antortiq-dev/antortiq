// Shopify webhook receivers — all brands hit these routes
const express = require('express');
const router = express.Router();
const Brand = require('../models/Brand');
const { sendOrderConfirmation } = require('../wa-bot/order-confirm');
const { botState } = require('../wa-bot/index');

// Raw body needed for HMAC verification (future)
router.use(express.raw({ type: 'application/json' }));

function getBody(req) {
  try { return JSON.parse(req.body); } catch { return {}; }
}

function getBrandByDomain(shopDomain) {
  return Brand.findOne({ shopDomain, active: true });
}

// POST /webhooks/orders-create
router.post('/orders-create', async (req, res) => {
  res.sendStatus(200); // ack immediately — Shopify retries if no 200 within 5s
  try {
    const shopDomain = req.headers['x-shopify-shop-domain'];
    const order = getBody(req);
    if (!shopDomain || !order.id) return;

    const brand = await getBrandByDomain(shopDomain);
    if (!brand) return console.log(`[webhook] Unknown shop: ${shopDomain}`);

    console.log(`[webhook] orders/create — ${brand.name} — #${order.order_number} — ${order.financial_status}`);

    // Send interactive WA confirmation with Yes/No buttons
    await sendOrderConfirmation(botState.sock, order, brand);
    // TODO: save order to local DB
  } catch (e) { console.error('[webhook] orders-create error:', e.message); }
});

// POST /webhooks/orders-updated
router.post('/orders-updated', async (req, res) => {
  res.sendStatus(200);
  try {
    const shopDomain = req.headers['x-shopify-shop-domain'];
    const order = getBody(req);
    if (!shopDomain || !order.id) return;

    const brand = await getBrandByDomain(shopDomain);
    if (!brand) return;

    console.log(`[webhook] orders/updated — ${brand.name} — #${order.order_number} — ${order.fulfillment_status}`);
  } catch (e) { console.error('[webhook] orders-updated error:', e.message); }
});

// POST /webhooks/fulfillments-create
router.post('/fulfillments-create', async (req, res) => {
  res.sendStatus(200);
  try {
    const shopDomain = req.headers['x-shopify-shop-domain'];
    const fulfillment = getBody(req);
    if (!shopDomain || !fulfillment.id) return;

    const brand = await getBrandByDomain(shopDomain);
    if (!brand) return;

    const awb = fulfillment.tracking_number || '';
    const courier = fulfillment.tracking_company || '';
    console.log(`[webhook] fulfillments/create — ${brand.name} — AWB: ${awb} — ${courier}`);

    // TODO: send WA "Your order is shipped" message with tracking link
  } catch (e) { console.error('[webhook] fulfillments-create error:', e.message); }
});

// POST /webhooks/fulfillments-update
router.post('/fulfillments-update', async (req, res) => {
  res.sendStatus(200);
  try {
    const shopDomain = req.headers['x-shopify-shop-domain'];
    const fulfillment = getBody(req);
    if (!shopDomain || !fulfillment.id) return;

    const brand = await getBrandByDomain(shopDomain);
    if (!brand) return;

    console.log(`[webhook] fulfillments/update — ${brand.name} — status: ${fulfillment.status}`);
  } catch (e) { console.error('[webhook] fulfillments-update error:', e.message); }
});

module.exports = router;
