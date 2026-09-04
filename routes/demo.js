const express = require('express');
const router  = express.Router();
const { connect } = require('../db');
const DemoOrder  = require('../models/DemoOrder');
const PixelEvent = require('../models/PixelEvent');

const DEMO_KEY = process.env.DEMO_KEY || 'antortiq-demo';

function auth(req, res, next) {
  const key = req.headers['x-demo-key'] || req.query.key;
  if (key !== DEMO_KEY) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

function dateMatch(from, to, vendor) {
  const m = {};
  if (from) m.createdAt = { ...m.createdAt, $gte: new Date(`${from}T00:00:00.000Z`) };
  if (to)   m.createdAt = { ...m.createdAt, $lte: new Date(`${to}T23:59:59.999Z`) };
  if (vendor && vendor !== 'all') m.vendorName = vendor;
  return m;
}

// ── GET /api/demo/summary ─────────────────────────────────────────────────────
router.get('/summary', auth, async (req, res) => {
  try {
    await connect();
    const m = dateMatch(req.query.from, req.query.to, req.query.vendor);

    const [stageCounts, revenueAgg, allTimeAgg] = await Promise.all([
      DemoOrder.aggregate([{ $match: m }, { $group: { _id: '$stage', count: { $sum: 1 }, revenue: { $sum: '$myRevenue' } } }]),
      DemoOrder.aggregate([{ $match: m }, { $group: { _id: null, total: { $sum: '$myRevenue' }, orders: { $sum: 1 } } }]),
      DemoOrder.aggregate([{ $group: { _id: null, total: { $sum: '$myRevenue' }, orders: { $sum: 1 } } }]),
    ]);

    const sc = {};
    stageCounts.forEach(s => { sc[s._id] = { count: s.count, revenue: s.revenue }; });

    const rev   = revenueAgg[0] || { total: 0, orders: 0 };
    const allT  = allTimeAgg[0] || { total: 0, orders: 0 };

    // Fulfillment stats
    const CONFIRMED_STAGES  = ['confirmed','ready','pickup','transit','ofd','delivered','rto','partial'];
    const DISPATCHED_STAGES = ['ready','pickup','transit','ofd','delivered','rto'];
    const active     = CONFIRMED_STAGES.reduce((s, k)  => s + (sc[k]?.count  || 0), 0);
    const dispatched = DISPATCHED_STAGES.reduce((s, k) => s + (sc[k]?.count  || 0), 0);
    const delivered  = sc.delivered?.count  || 0;
    const rto        = sc.rto?.count        || 0;
    const cancelled  = sc.cancelled?.count  || 0;
    const newOrds    = sc.new?.count        || 0;
    const totalOrds  = Object.values(sc).reduce((s, v) => s + v.count, 0);

    const revDispatched    = DISPATCHED_STAGES.reduce((s, k) => s + (sc[k]?.revenue || 0), 0);
    const revPending       = (sc.confirmed?.revenue || 0) + (sc.partial?.revenue || 0);
    const revNotConfirmed  = (sc.new?.revenue || 0) + (sc.hold?.revenue || 0);
    const revCancelled     = sc.cancelled?.revenue || 0;

    const dispatchRate = active > 0 ? Math.round(dispatched / active * 100) : 0;
    const deliveryRate = dispatched > 0 ? Math.round(delivered / dispatched * 100) : 0;
    const rtoRate      = dispatched > 0 ? Math.round(rto / dispatched * 100) : 0;

    res.json({
      period: { orders: rev.orders, revenue: rev.total },
      allTime: { orders: allT.orders, revenue: allT.total },
      stageCounts: Object.fromEntries(Object.entries(sc).map(([k, v]) => [k, v.count])),
      fulfillStats: {
        total: totalOrds, active, dispatched, delivered, rto, cancelled, newOrds,
        dispatchRate, deliveryRate, rtoRate,
        revDispatched, revPending, revNotConfirmed, revCancelled,
        stageMap: Object.fromEntries(Object.entries(sc).map(([k, v]) => [k, v.count])),
      },
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/demo/orders ──────────────────────────────────────────────────────
router.get('/orders', auth, async (req, res) => {
  try {
    await connect();
    const { stage, vendor, search, page = 1, limit = 50 } = req.query;
    const m = dateMatch(req.query.from, req.query.to, vendor);
    if (stage && stage !== 'all') m.stage = stage;
    if (search) {
      const re = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      m.$or = [{ orderName: re }, { customerName: re }, { productName: re }, { awb: re }, { vendorName: re }];
    }
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [orders, total] = await Promise.all([
      DemoOrder.find(m).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)).lean(),
      DemoOrder.countDocuments(m),
    ]);
    res.json({ orders, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/demo/daily ───────────────────────────────────────────────────────
router.get('/daily', auth, async (req, res) => {
  try {
    await connect();
    const m = dateMatch(req.query.from, req.query.to, req.query.vendor);
    const rows = await DemoOrder.aggregate([
      { $match: m },
      { $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          orders:    { $sum: 1 },
          revenue:   { $sum: '$myRevenue' },
          delivered: { $sum: { $cond: [{ $eq: ['$stage', 'delivered'] }, 1, 0] } },
          confirmed: { $sum: { $cond: [{ $in:  ['$stage', ['confirmed','ready','pickup','transit','ofd','delivered','rto','partial']] }, 1, 0] } },
      }},
      { $sort: { _id: 1 } },
    ]);
    res.json({ daily: rows.map(r => ({ date: r._id, orders: r.orders, revenue: r.revenue, delivered: r.delivered, confirmed: r.confirmed })) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/demo/vendors ─────────────────────────────────────────────────────
router.get('/vendors', auth, async (req, res) => {
  try {
    await connect();
    const rows = await DemoOrder.aggregate([
      { $group: { _id: '$vendorName', orders: { $sum: 1 }, revenue: { $sum: '$myRevenue' }, pct: { $first: '$commissionPct' } } },
      { $sort: { orders: -1 } },
    ]);
    res.json({ vendors: rows.map(r => ({ name: r._id, orders: r.orders, revenue: r.revenue, commissionPct: r.pct })) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── PIXEL TRACKER routes (demo-keyed, no admin key needed) ────────────────────

function pixelDateMatch(from, to) {
  const m = {};
  if (from) m.created_at = { ...m.created_at, $gte: `${from}T00:00:00.000Z` };
  if (to)   m.created_at = { ...m.created_at, $lte: `${to}T23:59:59.999Z` };
  return m;
}

// GET /api/demo/pixel/summary
router.get('/pixel/summary', auth, async (req, res) => {
  try {
    await connect();
    const match = pixelDateMatch(req.query.from, req.query.to);
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
      viewToAtcRate:          views        ? (effectiveAtc / views)       * 100 : 0,
      atcToCheckoutRate:      effectiveAtc ? (checkout / effectiveAtc)    * 100 : 0,
      checkoutToPurchaseRate: checkout     ? (purchases / checkout)       * 100 : 0,
      viewToPurchaseRate:     views        ? (purchases / views)          * 100 : 0,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/demo/pixel/top-products
router.get('/pixel/top-products', auth, async (req, res) => {
  try {
    await connect();
    const VALID = ['ViewContent','AddToCart','InitiateCheckout','Purchase'];
    const metric = VALID.includes(req.query.metric) ? req.query.metric : 'ViewContent';
    const limit  = Math.min(parseInt(req.query.limit) || 30, 100);
    const match  = { ...pixelDateMatch(req.query.from, req.query.to), eventName: metric, productName: { $ne: 'N/A' } };
    const top = await PixelEvent.aggregate([
      { $match: match },
      { $group: { _id: '$productName', count: { $sum: 1 }, image: { $last: '$productImage' } } },
      { $sort: { count: -1 } },
      { $limit: limit },
    ]);
    res.json({ products: top.map(t => ({ productName: t._id, count: t.count, productImage: t.image || '' })) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/demo/pixel/leaderboard
router.get('/pixel/leaderboard', auth, async (req, res) => {
  try {
    await connect();
    const limit    = Math.min(parseInt(req.query.limit) || 20, 100);
    const minViews = parseInt(req.query.minViews) || 5;
    const match    = { ...pixelDateMatch(req.query.from, req.query.to), productName: { $ne: 'N/A' } };
    const rows = await PixelEvent.aggregate([
      { $match: match },
      { $group: {
          _id:       '$productName',
          image:     { $last: '$productImage' },
          views:     { $sum: { $cond: [{ $eq: ['$eventName','ViewContent'] }, 1, 0] } },
          atc:       { $sum: { $cond: [{ $eq: ['$eventName','AddToCart'] }, 1, 0] } },
          checkout:  { $sum: { $cond: [{ $eq: ['$eventName','InitiateCheckout'] }, 1, 0] } },
          purchases: { $sum: { $cond: [{ $eq: ['$eventName','Purchase'] }, 1, 0] } },
      }},
    ]);
    const SORT_KEYS = ['viewToAtcRate','viewToCheckoutRate','atcToCheckoutRate','checkoutToPurchaseRate','viewToPurchaseRate'];
    const sortBy = SORT_KEYS.includes(req.query.sortBy) ? req.query.sortBy : 'views';
    const withRates = rows.filter(r => r.views >= minViews).map(r => {
      const ea = Math.max(r.atc, r.checkout);
      return {
        productName: r._id, productImage: r.image || '',
        views: r.views, atc: r.atc, checkout: r.checkout, purchases: r.purchases,
        viewToAtcRate:          r.views   ? (ea / r.views)        * 100 : 0,
        viewToCheckoutRate:     r.views   ? (r.checkout / r.views)* 100 : 0,
        atcToCheckoutRate:      ea        ? (r.checkout / ea)     * 100 : 0,
        checkoutToPurchaseRate: r.checkout? (r.purchases/r.checkout)*100: 0,
        viewToPurchaseRate:     r.views   ? (r.purchases/r.views) * 100 : 0,
      };
    });
    withRates.sort((a, b) => (b[sortBy] || b.views) - (a[sortBy] || a.views));
    res.json({ products: withRates.slice(0, limit) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/demo/pixel/recent
router.get('/pixel/recent', auth, async (req, res) => {
  try {
    await connect();
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const logs  = await PixelEvent.find({}, { _id: 0 }).sort({ created_at: -1 }).limit(limit).lean();
    res.json({ logs });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
