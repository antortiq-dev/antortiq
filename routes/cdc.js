const express = require('express');
const mongoose = require('mongoose');

const router = express.Router();

async function getCdcData() {
  const col = mongoose.connection.db.collection('cdc_demo');
  return col.findOne({ _id: 'cdc_data' });
}

// Full document
router.get('/data', async (req, res) => {
  try {
    const doc = await getCdcData();
    if (!doc) return res.status(404).json({ error: 'CDC data not seeded. Run: node seed-cdc.js' });
    res.json(doc);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Orders — return all when created_at_min present (full load), else paginate
router.get('/orders', async (req, res) => {
  try {
    const doc = await getCdcData();
    if (!doc) return res.json({ orders: [], total: 0 });

    let orders = doc.orders || [];
    const { stage, vendor, search, page, limit, created_at_min } = req.query;

    if (stage && stage !== 'all') {
      orders = orders.filter(o => o.stage === stage);
    }
    if (vendor) {
      orders = orders.filter(o => (o.vendors || []).some(v => v.toLowerCase() === vendor.toLowerCase()));
    }
    if (search) {
      const q = search.toLowerCase();
      orders = orders.filter(o =>
        (o.id || '').toLowerCase().includes(q) ||
        (o.customer || '').toLowerCase().includes(q) ||
        String(o.shopifyId || '').includes(q)
      );
    }

    const total = orders.length;

    // When created_at_min is present the React app wants all orders (no pagination)
    if (created_at_min || !page) {
      return res.json({ orders, total });
    }

    const p   = parseInt(page, 10) || 1;
    const lim = parseInt(limit, 10) || 25;
    const paged = orders.slice((p - 1) * lim, p * lim);
    res.json({ orders: paged, total, page: p, limit: lim, pages: Math.ceil(total / lim) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Analytics — returns exact JARVIS /admin/analytics shape
router.get('/analytics', async (req, res) => {
  try {
    const doc = await getCdcData();
    res.json(doc ? doc.analytics : {});
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Stats (legacy)
router.get('/stats', async (req, res) => {
  try {
    const doc = await getCdcData();
    res.json(doc ? doc.analytics : doc ? doc.stats : {});
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Vendors
router.get('/vendors', async (req, res) => {
  try {
    const doc = await getCdcData();
    res.json({ vendors: doc ? doc.vendors : [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Pixel tracker
router.get('/pixel', async (req, res) => {
  try {
    const doc = await getCdcData();
    res.json(doc ? doc.pixel : { summary: {}, products: [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Settlements
router.get('/settlements', async (req, res) => {
  try {
    const doc = await getCdcData();
    res.json({ settlements: doc ? doc.settlements : [], vendors: doc ? doc.vendors : [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Support chatbot findings
router.get('/support', async (req, res) => {
  try {
    const doc = await getCdcData();
    res.json({ insights: doc ? doc.support : [], chats: [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Stage timings (for dashboard fulfillment speed panel)
router.get('/timings', async (req, res) => {
  try {
    const doc = await getCdcData();
    const orders = doc ? doc.orders : [];
    const delivered = orders.filter(o => o.stage === 'delivered');
    const rto = orders.filter(o => o.stage === 'rto');
    res.json({
      avgConfirmedToDeliveredHours: 52,
      avgConfirmedToRtoHours: 71,
      deliveredSampleCount: delivered.length,
      rtoSampleCount: rto.length,
      transitions: [
        { from: 'confirmed', to: 'ready',    avgHours: 8,  count: 200 },
        { from: 'ready',     to: 'transit',  avgHours: 18, count: 175 },
        { from: 'transit',   to: 'delivered',avgHours: 26, count: delivered.length },
        { from: 'transit',   to: 'rto',      avgHours: 30, count: rto.length },
      ],
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Vendor scorecard (matches JARVIS /admin/vendor-scorecard shape)
router.get('/scorecard', async (req, res) => {
  try {
    const doc = await getCdcData();
    const vendors = doc ? doc.vendors : [];
    const vendorScores = vendors.map(v => ({
      vendor: v.name,
      totalOrders: v.orders_handled,
      stuckCount: Math.floor(Math.random() * 3),
      avgDispatchHrs: v.avg_dispatch_days * 24,
      avgPendingHrs: v.avg_dispatch_days * 24 * 1.4,
      deliveryRate: v.delivered,
      rtoRate: v.rto_rate,
      score: v.score,
    }));
    res.json({ vendorScores });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Brain / pattern intelligence
router.get('/brain', async (req, res) => {
  try {
    const doc = await getCdcData();
    const brain = doc ? doc.brain : [];
    // Support both /admin/brain-insights and /admin/pattern-report shapes
    res.json({
      insights: brain,
      patterns: brain,
      report: brain,
      history: [],
      preview: { patterns: brain, summary: `${brain.length} insights generated from 500 CDC orders` },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Meta ads — returns both /admin/meta-ads/insights and audiences shape
router.get('/meta', async (req, res) => {
  try {
    const doc = await getCdcData();
    const campaigns = doc ? doc.meta : [];
    res.json({
      campaigns,
      insights: campaigns,
      audiences: [
        { name: 'Streetwear Enthusiasts 18-24', size: 480000, cpm: 82, relevance: 8.4 },
        { name: 'Sneaker Culture India',         size: 210000, cpm: 94, relevance: 9.1 },
        { name: 'Urban Fashion Delhi/Mumbai',     size: 340000, cpm: 76, relevance: 7.8 },
        { name: 'Lookalike — Past Buyers',        size: 156000, cpm: 68, relevance: 9.6 },
      ],
      summary: {
        totalSpend: campaigns.reduce((s, c) => s + c.spend, 0),
        totalRevenue: campaigns.reduce((s, c) => s + c.revenue, 0),
        avgRoas: parseFloat((campaigns.filter(c=>c.roas>0).reduce((s,c)=>s+c.roas,0) / campaigns.filter(c=>c.roas>0).length).toFixed(2)),
        totalOrders: campaigns.reduce((s, c) => s + c.orders, 0),
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
