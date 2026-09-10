/**
 * remap-demo-revenue.js
 * Bumps existing DemoOrder myRevenue values to realistic premium D2C range
 * so dashboard shows ₹10-15L/month (₹30-45L for 90 days across ~800 orders).
 * Run standalone: node scripts/remap-demo-revenue.js
 * Or imported:    require('./scripts/remap-demo-revenue').run()
 */
if (require.main === module) {
  require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
}
const mongoose = require('mongoose');
const DemoOrder = require('../models/DemoOrder');

// Realistic premium streetwear order values (multi-item orders, bundles)
const PRICE_TIERS = [
  1999, 2199, 2499, 2799, 2999,
  3199, 3499, 3799, 3999,
  4199, 4499, 4799, 4999,
  5299, 5499, 5799, 5999,
  6499, 6999, 7499, 7999,
  8499, 8999,
];

// Weight towards mid-range (3k-6k) for realistic distribution
const WEIGHTS = [
  2, 2, 3, 3, 4,
  5, 5, 5, 6,
  6, 6, 5, 5,
  4, 4, 3, 3,
  2, 2, 1, 1,
  1, 1,
];

function pickRevenue() {
  const total = WEIGHTS.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < PRICE_TIERS.length; i++) {
    r -= WEIGHTS[i];
    if (r <= 0) return PRICE_TIERS[i];
  }
  return PRICE_TIERS[PRICE_TIERS.length - 1];
}

async function run() {
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  }
  console.log('[revenue-remap] Starting…');

  const orders = await DemoOrder.find({}, { _id: 1 }).lean();
  console.log(`[revenue-remap] ${orders.length} orders to update`);

  const ops = orders.map(o => ({
    updateOne: {
      filter: { _id: o._id },
      update: { $set: { myRevenue: pickRevenue() } }
    }
  }));

  const BATCH = 500;
  for (let i = 0; i < ops.length; i += BATCH) {
    await DemoOrder.bulkWrite(ops.slice(i, i + BATCH));
    process.stdout.write(`\r[revenue-remap] ${Math.min(i + BATCH, ops.length)}/${ops.length}`);
  }

  // Print summary
  const [agg] = await DemoOrder.aggregate([{
    $group: { _id: null, total: { $sum: '$myRevenue' }, avg: { $avg: '$myRevenue' }, count: { $sum: 1 } }
  }]);
  console.log(`\n[revenue-remap] Done ✓`);
  console.log(`  Total: ₹${(agg.total / 100000).toFixed(1)}L | Avg order: ₹${Math.round(agg.avg)} | Orders: ${agg.count}`);
  console.log(`  ~Monthly: ₹${(agg.total / 3 / 100000).toFixed(1)}L`);

  if (require.main === module) await mongoose.disconnect();
}

if (require.main === module) {
  run().catch(e => { console.error(e); process.exit(1); });
}

module.exports = { run };
