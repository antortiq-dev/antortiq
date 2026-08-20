// Internal brand management + Shopify onboarding API
const express = require('express');
const router = express.Router();
const Brand = require('../models/Brand');
const { registerAllWebhooks, listWebhooks, getOrders } = require('../lib/shopify');

const ADMIN_KEY = process.env.ADMIN_API_KEY || 'antortiq-admin-2025';

function auth(req, res, next) {
  const key = req.headers['x-admin-key'] || req.query.key;
  if (key !== ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// GET /api/brands — list all brands
router.get('/', auth, async (req, res) => {
  try {
    const brands = await Brand.find({}, '-accessToken -razorpaySecret').sort({ createdAt: -1 });
    res.json(brands);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/brands — add a new brand + register webhooks
router.post('/', auth, async (req, res) => {
  try {
    const { shopId, shopDomain, accessToken, name, waNumber, razorpayKey, razorpaySecret, accentColor, logoUrl } = req.body;
    if (!shopId || !shopDomain || !accessToken || !name) {
      return res.status(400).json({ error: 'shopId, shopDomain, accessToken, name are required' });
    }

    const domain = shopDomain.replace(/https?:\/\//,'').replace(/\//,'').trim();

    // Test the token first
    const testRes = await fetch(`https://${domain}/admin/api/2024-01/shop.json`, {
      headers: { 'X-Shopify-Access-Token': accessToken },
    });
    if (!testRes.ok) return res.status(400).json({ error: 'Invalid Shopify credentials — token test failed' });

    const brand = await Brand.findOneAndUpdate(
      { shopId },
      { shopId, shopDomain: domain, accessToken, name, waNumber, razorpayKey, razorpaySecret, accentColor: accentColor || '#0f0f0f', logoUrl: logoUrl || '' },
      { upsert: true, new: true }
    );

    // Register webhooks
    const BASE = process.env.APP_URL || 'https://antortiq.onrender.com';
    const webhookResults = await registerAllWebhooks(domain, accessToken, BASE);
    const allOk = webhookResults.every(w => w.ok);
    await Brand.updateOne({ shopId }, { webhooksRegistered: allOk });

    res.json({ brand: { ...brand.toObject(), accessToken: '***' }, webhooks: webhookResults });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/brands/:shopId — get one brand
router.get('/:shopId', auth, async (req, res) => {
  try {
    const brand = await Brand.findOne({ shopId: req.params.shopId }, '-accessToken -razorpaySecret');
    if (!brand) return res.status(404).json({ error: 'Brand not found' });
    res.json(brand);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/brands/:shopId — update brand fields
router.patch('/:shopId', auth, async (req, res) => {
  try {
    const allowed = ['name','waNumber','razorpayKey','razorpaySecret','accentColor','logoUrl','active','accessToken'];
    const update = {};
    for (const k of allowed) { if (req.body[k] !== undefined) update[k] = req.body[k]; }
    const brand = await Brand.findOneAndUpdate({ shopId: req.params.shopId }, update, { new: true });
    if (!brand) return res.status(404).json({ error: 'Brand not found' });
    res.json({ ok: true, brand: { ...brand.toObject(), accessToken: '***', razorpaySecret: '***' } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/brands/:shopId/webhooks — re-register webhooks
router.post('/:shopId/webhooks', auth, async (req, res) => {
  try {
    const brand = await Brand.findOne({ shopId: req.params.shopId });
    if (!brand) return res.status(404).json({ error: 'Brand not found' });
    const BASE = process.env.APP_URL || 'https://antortiq.onrender.com';
    const results = await registerAllWebhooks(brand.shopDomain, brand.accessToken, BASE);
    const allOk = results.every(w => w.ok);
    await Brand.updateOne({ shopId: req.params.shopId }, { webhooksRegistered: allOk });
    res.json({ results });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/brands/:shopId/webhooks — list current webhooks on Shopify
router.get('/:shopId/webhooks', auth, async (req, res) => {
  try {
    const brand = await Brand.findOne({ shopId: req.params.shopId });
    if (!brand) return res.status(404).json({ error: 'Brand not found' });
    const webhooks = await listWebhooks(brand.shopDomain, brand.accessToken);
    res.json({ webhooks });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/brands/:shopId/orders — fetch recent orders from Shopify
router.get('/:shopId/orders', auth, async (req, res) => {
  try {
    const brand = await Brand.findOne({ shopId: req.params.shopId });
    if (!brand) return res.status(404).json({ error: 'Brand not found' });
    const orders = await getOrders(brand.shopDomain, brand.accessToken);
    res.json({ orders });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/brands/:shopId — remove brand
router.delete('/:shopId', auth, async (req, res) => {
  try {
    await Brand.deleteOne({ shopId: req.params.shopId });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
