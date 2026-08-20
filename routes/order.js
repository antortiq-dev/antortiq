// Customer-facing order routes
const express = require('express');
const router = express.Router();
const Brand = require('../models/Brand');
const { shopifyFetch } = require('../lib/shopify');

// GET /order/brand-config?shop=shopId — public brand config for the frontend
router.get('/brand-config', async (req, res) => {
  try {
    const { shop } = req.query;
    if (!shop) return res.status(400).json({ error: 'shop param required' });
    const brand = await Brand.findOne({ shopId: shop, active: true }, 'name accentColor logoUrl waNumber razorpayKey shopId');
    if (!brand) return res.status(404).json({ error: 'Brand not found' });
    res.json({
      shopId:      brand.shopId,
      name:        brand.name,
      accentColor: brand.accentColor || '#0f0f0f',
      logoUrl:     brand.logoUrl || '',
      waNumber:    brand.waNumber || '',
      hasRazorpay: !!brand.razorpayKey,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /order/confirm — confirm order without payment (no Razorpay)
// Adds "Confirmed by Antortiq" tag + note on Shopify order
router.post('/confirm', async (req, res) => {
  try {
    const { shopId, shopifyOrderId, orderName } = req.body;
    if (!shopId || !shopifyOrderId) return res.status(400).json({ error: 'shopId and shopifyOrderId required' });

    const brand = await Brand.findOne({ shopId, active: true });
    if (!brand) return res.status(404).json({ error: 'Brand not found' });

    // Fetch current order to get existing tags
    const orderRes = await shopifyFetch(brand.shopDomain, brand.accessToken, `/orders/${shopifyOrderId}.json?fields=id,tags,note`);
    if (!orderRes.ok) return res.status(400).json({ error: 'Could not fetch order from Shopify' });
    const { order } = await orderRes.json();

    // Build updated tags (avoid duplicates)
    const existingTags = order.tags ? order.tags.split(',').map(t => t.trim()).filter(Boolean) : [];
    const newTag = 'Confirmed by Antortiq';
    if (!existingTags.includes(newTag)) existingTags.push(newTag);

    // Update order on Shopify
    const updateRes = await shopifyFetch(brand.shopDomain, brand.accessToken, `/orders/${shopifyOrderId}.json`, {
      method: 'PUT',
      body: JSON.stringify({
        order: {
          id: shopifyOrderId,
          tags: existingTags.join(', '),
          note: `${order.note ? order.note + '\n' : ''}Order confirmed by customer via Antortiq (no payment required).`,
        },
      }),
    });
    if (!updateRes.ok) {
      const err = await updateRes.json();
      return res.status(400).json({ error: 'Shopify update failed', details: err });
    }

    console.log(`[order/confirm] ${brand.name} — ${orderName || shopifyOrderId} confirmed without payment`);
    res.json({ ok: true, tag: newTag });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
