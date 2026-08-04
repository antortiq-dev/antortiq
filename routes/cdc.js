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

// Orders — paginated, filterable
router.get('/orders', async (req, res) => {
  try {
    const doc = await getCdcData();
    if (!doc) return res.json({ orders: [], total: 0 });

    let orders = doc.orders || [];
    const { status, search, page = 1, limit = 25 } = req.query;

    if (status && status !== 'all') {
      orders = orders.filter(o => o.status === status || o.stage === status);
    }
    if (search) {
      const q = search.toLowerCase();
      orders = orders.filter(o =>
        (o.name || '').toLowerCase().includes(q) ||
        (o.customer_name || '').toLowerCase().includes(q) ||
        (o.city || '').toLowerCase().includes(q)
      );
    }

    const total = orders.length;
    const p = parseInt(page, 10);
    const lim = parseInt(limit, 10);
    const paged = orders.slice((p - 1) * lim, p * lim);

    res.json({ orders: paged, total, page: p, limit: lim, pages: Math.ceil(total / lim) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Stats
router.get('/stats', async (req, res) => {
  try {
    const doc = await getCdcData();
    res.json(doc ? doc.stats : {});
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
