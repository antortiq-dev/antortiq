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

// Brain insights
router.get('/brain', async (req, res) => {
  try {
    const doc = await getCdcData();
    res.json({ insights: doc ? doc.brain : [] });
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

// Meta ads
router.get('/meta', async (req, res) => {
  try {
    const doc = await getCdcData();
    res.json({ campaigns: doc ? doc.meta : [] });
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
    res.json({ insights: doc ? doc.support : [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
