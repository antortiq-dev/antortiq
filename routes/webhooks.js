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

// ── WhatsApp Cloud API webhooks ────────────────────────────────────────────

// GET /webhooks/whatsapp — Meta verification challenge
router.get('/whatsapp', (req, res) => {
  const mode  = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === process.env.WA_VERIFY_TOKEN) {
    console.log('[wa-cloud] Webhook verified');
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// POST /webhooks/whatsapp — incoming messages & status updates
router.post('/whatsapp', (req, res) => {
  res.sendStatus(200); // ack immediately
  try {
    const body = getBody(req);
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    if (!value) return;

    // Incoming message
    const messages = value.messages || [];
    for (const m of messages) {
      const from = m.from; // phone number string e.g. "919876543210"
      const type = m.type;
      let text = '';
      if (type === 'text') text = m.text?.body || '';
      else if (type === 'interactive') {
        // list reply or button reply
        text = m.interactive?.list_reply?.id ||
               m.interactive?.button_reply?.id || '';
      }
      console.log(`[wa-cloud] msg from ${from}: ${text.slice(0, 80)}`);
      // TODO: route to handleConfirmationResponse / AI reply
    }

    // Status updates (sent/delivered/read/failed)
    const statuses = value.statuses || [];
    for (const s of statuses) {
      console.log(`[wa-cloud] status ${s.status} for msg ${s.id} to ${s.recipient_id}`);
    }
  } catch (e) { console.error('[wa-cloud] webhook error:', e.message); }
});

module.exports = router;
