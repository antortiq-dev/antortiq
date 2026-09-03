const express = require('express');
const router = express.Router();
const { connect } = require('../db');
const PixelEvent = require('../models/PixelEvent');

const VALID_EVENTS = ['ViewContent', 'AddToCart', 'InitiateCheckout', 'Purchase'];
const ADMIN_KEY = process.env.ADMIN_API_KEY || 'antortiq-admin';

function adminAuth(req, res, next) {
  const key = req.headers['x-admin-key'] || req.query.key;
  if (key !== ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

function dateMatch(from, to, storeCode) {
  const match = {};
  if (from) match.created_at = { ...match.created_at, $gte: `${from}T00:00:00.000Z` };
  if (to)   match.created_at = { ...match.created_at, $lte: `${to}T23:59:59.999Z` };
  if (storeCode) match.storeCode = storeCode;
  return match;
}

// ── POST /api/pixel/track — ingest from storefront pixel script ────────────
router.post('/track', async (req, res) => {
  try {
    await connect();
    const { storeCode, brandName, eventName, productName, productImage, value, currency, timestamp } = req.body || {};
    if (!eventName || !VALID_EVENTS.includes(eventName))
      return res.status(400).json({ error: 'Invalid eventName' });
    await PixelEvent.create({
      storeCode:        (storeCode || '').slice(0, 100),
      brandName:        (brandName || '').slice(0, 200),
      eventName,
      productName:      (productName || 'N/A').toString().slice(0, 200),
      productImage:     (productImage || '').toString().slice(0, 500),
      value:            value != null && value !== '' ? parseFloat(value) || 0 : null,
      currency:         (currency || '').slice(0, 10),
      client_timestamp: timestamp || null,
      created_at:       new Date().toISOString(),
    });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/pixel/summary — KPI cards + funnel rates ─────────────────────
router.get('/summary', adminAuth, async (req, res) => {
  try {
    await connect();
    const match = dateMatch(req.query.from, req.query.to, req.query.storeCode);
    const rows = await PixelEvent.aggregate([
      { $match: match },
      { $group: { _id: '$eventName', count: { $sum: 1 }, value: { $sum: { $ifNull: ['$value', 0] } } } },
    ]);
    const by = Object.fromEntries(rows.map(r => [r._id, r.count]));
    const vals = Object.fromEntries(rows.map(r => [r._id, r.value]));
    const views = by.ViewContent || 0, atc = by.AddToCart || 0,
          checkout = by.InitiateCheckout || 0, purchases = by.Purchase || 0;
    const effectiveAtc = Math.max(atc, checkout);
    res.json({
      views, atc, checkout, purchases,
      purchaseValue: vals.Purchase || 0,
      viewToAtcRate:           views        ? (effectiveAtc / views)        * 100 : 0,
      atcToCheckoutRate:       effectiveAtc ? (checkout / effectiveAtc)     * 100 : 0,
      checkoutToPurchaseRate:  checkout     ? (purchases / checkout)        * 100 : 0,
      viewToPurchaseRate:      views        ? (purchases / views)           * 100 : 0,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/pixel/top-products ─────────────────────────────────────────
router.get('/top-products', adminAuth, async (req, res) => {
  try {
    await connect();
    const metric = VALID_EVENTS.includes(req.query.metric) ? req.query.metric : 'ViewContent';
    const limit = Math.min(parseInt(req.query.limit) || 30, 100);
    const match = { ...dateMatch(req.query.from, req.query.to, req.query.storeCode), eventName: metric, productName: { $ne: 'N/A' } };
    const top = await PixelEvent.aggregate([
      { $match: match },
      { $group: { _id: '$productName', count: { $sum: 1 }, image: { $last: '$productImage' } } },
      { $sort: { count: -1 } },
      { $limit: limit },
    ]);
    res.json({ products: top.map(t => ({ productName: t._id, count: t.count, productImage: t.image || '' })) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/pixel/leaderboard — per-product funnel ────────────────────
router.get('/leaderboard', adminAuth, async (req, res) => {
  try {
    await connect();
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const minViews = parseInt(req.query.minViews) || 5;
    const match = { ...dateMatch(req.query.from, req.query.to, req.query.storeCode), productName: { $ne: 'N/A' } };
    const rows = await PixelEvent.aggregate([
      { $match: match },
      { $group: {
          _id: '$productName',
          image:     { $last: '$productImage' },
          views:     { $sum: { $cond: [{ $eq: ['$eventName', 'ViewContent'] }, 1, 0] } },
          atc:       { $sum: { $cond: [{ $eq: ['$eventName', 'AddToCart'] }, 1, 0] } },
          checkout:  { $sum: { $cond: [{ $eq: ['$eventName', 'InitiateCheckout'] }, 1, 0] } },
          purchases: { $sum: { $cond: [{ $eq: ['$eventName', 'Purchase'] }, 1, 0] } },
      }},
    ]);
    const SORT_KEYS = ['viewToAtcRate','viewToCheckoutRate','atcToCheckoutRate','checkoutToPurchaseRate','viewToPurchaseRate'];
    const sortBy = SORT_KEYS.includes(req.query.sortBy) ? req.query.sortBy : 'views';
    const withRates = rows.filter(r => r.views >= minViews).map(r => {
      const effectiveAtc = Math.max(r.atc, r.checkout);
      return {
        productName: r._id, productImage: r.image || '',
        views: r.views, atc: r.atc, checkout: r.checkout, purchases: r.purchases,
        viewToAtcRate:          r.views        ? (effectiveAtc / r.views)       * 100 : 0,
        viewToCheckoutRate:     r.views        ? (r.checkout / r.views)         * 100 : 0,
        atcToCheckoutRate:      effectiveAtc   ? (r.checkout / effectiveAtc)    * 100 : 0,
        checkoutToPurchaseRate: r.checkout     ? (r.purchases / r.checkout)     * 100 : 0,
        viewToPurchaseRate:     r.views        ? (r.purchases / r.views)        * 100 : 0,
      };
    });
    withRates.sort((a, b) => (b[sortBy] || b.views) - (a[sortBy] || a.views));
    res.json({ products: withRates.slice(0, limit) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/pixel/daily — day-by-day event counts for sparklines ───────
router.get('/daily', adminAuth, async (req, res) => {
  try {
    await connect();
    const match = dateMatch(req.query.from, req.query.to, req.query.storeCode);
    const rows = await PixelEvent.aggregate([
      { $match: match },
      { $group: {
          _id: { date: { $substr: ['$created_at', 0, 10] }, event: '$eventName' },
          count: { $sum: 1 },
      }},
      { $sort: { '_id.date': 1 } },
    ]);
    // pivot to { date, ViewContent, AddToCart, InitiateCheckout, Purchase }
    const byDate = {};
    rows.forEach(r => {
      const d = r._id.date;
      if (!byDate[d]) byDate[d] = { date: d, ViewContent: 0, AddToCart: 0, InitiateCheckout: 0, Purchase: 0 };
      byDate[d][r._id.event] = r.count;
    });
    res.json({ daily: Object.values(byDate) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/pixel/recent — live event log ──────────────────────────────
router.get('/recent', adminAuth, async (req, res) => {
  try {
    await connect();
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const match = req.query.storeCode ? { storeCode: req.query.storeCode } : {};
    const logs = await PixelEvent.find(match, { _id: 0 }).sort({ created_at: -1 }).limit(limit).lean();
    res.json({ logs });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/pixel/brands — list unique store codes ─────────────────────
router.get('/brands', adminAuth, async (req, res) => {
  try {
    await connect();
    const brands = await PixelEvent.aggregate([
      { $group: { _id: '$storeCode', brandName: { $last: '$brandName' }, count: { $sum: 1 }, last: { $max: '$created_at' } } },
      { $sort: { last: -1 } },
    ]);
    res.json({ brands: brands.map(b => ({ storeCode: b._id, brandName: b.brandName, count: b.count, last: b.last })) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
