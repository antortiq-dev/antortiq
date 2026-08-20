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

// GET /order/lookup?q=1066&contact=email@x.com&shop=sicos24
router.get('/lookup', async (req, res) => {
  try {
    const { q, contact, shop } = req.query;
    if (!q) return res.status(400).json({ error: 'Order number required' });
    if (!shop) return res.status(400).json({ error: 'shop param required' });

    const brand = await Brand.findOne({ shopId: shop, active: true });
    if (!brand) return res.status(404).json({ error: 'Brand not found' });

    // Search Shopify for the order by name (#1066 or 1066)
    const orderNum = q.replace('#', '');
    const searchRes = await shopifyFetch(brand.shopDomain, brand.accessToken,
      `/orders.json?name=${encodeURIComponent(orderNum)}&status=any&limit=5`);
    if (!searchRes.ok) return res.status(502).json({ error: 'Shopify fetch failed' });
    const { orders } = await searchRes.json();

    if (!orders || !orders.length) return res.status(404).json({ error: 'Order not found. Check your order number.' });

    // Verify contact matches (email or phone) — skip if contact is 'na'
    let order = orders[0];
    if (contact && contact !== 'na') {
      const c = contact.toLowerCase().trim();
      const matched = orders.find(o => {
        const email = (o.email || '').toLowerCase();
        const phone = (o.phone || '').replace(/\D/g, '');
        const digits = c.replace(/\D/g, '');
        return email === c || (digits.length >= 8 && phone.endsWith(digits));
      });
      if (!matched) return res.status(404).json({ error: 'Order not found for that email or phone.' });
      order = matched;
    }

    // Check if already confirmed (has our tag)
    const tags = (order.tags || '').split(',').map(t => t.trim());
    const already_confirmed = tags.includes('Confirmed by Antortiq') || order.financial_status === 'paid';
    const is_prepaid = order.financial_status === 'paid';

    // Determine stage from fulfillment status
    const fs = order.fulfillment_status;
    let stage = 'new';
    if (already_confirmed && !fs) stage = 'confirmed';
    if (fs === 'partial') stage = 'partial';
    if (fs === 'fulfilled') stage = 'delivered';

    // Build items
    const items = (order.line_items || []).map(li => ({
      title: li.title,
      variant_title: li.variant_title || '',
      quantity: li.quantity,
      price: li.price,
      image_url: li.image?.src || null,
    }));

    // Build shipments from fulfillments
    const vendor_shipments = (order.fulfillments || []).map(f => ({
      vendor_name: f.service || 'Courier',
      stage: f.status === 'success' ? 'delivered' : f.status === 'in_transit' ? 'transit' : f.status === 'out_for_delivery' ? 'ofd' : 'pickup',
      awb: f.tracking_number || '',
      courier: f.tracking_company || '',
      tracking_url: (f.tracking_urls && f.tracking_urls[0]) || f.tracking_url || '',
      items: (f.line_items || []).map(li => ({ title: li.title, qty: li.quantity })),
      tracking_history: [],
    }));

    if (vendor_shipments.length && stage === 'confirmed') stage = 'ready';
    if (vendor_shipments.some(s => s.stage === 'transit')) stage = 'transit';
    if (vendor_shipments.some(s => s.stage === 'ofd')) stage = 'ofd';
    if (vendor_shipments.every(s => s.stage === 'delivered')) stage = 'delivered';

    const addr = order.shipping_address || {};
    res.json({
      shopify_order_id: order.id,
      order_name: order.name,
      customer_name: order.customer ? `${order.customer.first_name || ''} ${order.customer.last_name || ''}`.trim() : '',
      stage,
      already_confirmed,
      is_prepaid,
      total: order.total_price,
      financial_status: order.financial_status,
      items,
      vendor_shipments,
      shipping_city: addr.city || '',
      shipping_state: addr.province || '',
      return_requests: [],
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /order/lookup-by-contact?contact=email&shop=sicos24
router.get('/lookup-by-contact', async (req, res) => {
  try {
    const { contact, shop } = req.query;
    if (!contact || !shop) return res.status(400).json({ error: 'contact and shop required' });

    const brand = await Brand.findOne({ shopId: shop, active: true });
    if (!brand) return res.status(404).json({ error: 'Brand not found' });

    const c = contact.toLowerCase().trim();
    const digits = c.replace(/\D/g, '');
    const isPhone = digits.length >= 8 && /^\d+$/.test(digits);

    const param = isPhone ? `phone=${encodeURIComponent('+' + digits)}` : `email=${encodeURIComponent(c)}`;
    const r = await shopifyFetch(brand.shopDomain, brand.accessToken,
      `/orders.json?${param}&status=any&limit=10`);
    if (!r.ok) return res.status(502).json({ error: 'Shopify fetch failed' });
    const { orders } = await r.json();
    if (!orders || !orders.length) return res.status(404).json({ error: 'No orders found for that contact.' });

    res.json({ orders: orders.map(o => ({ order_name: o.name, created_at: o.created_at })) });
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
