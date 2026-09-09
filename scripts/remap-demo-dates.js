/**
 * remap-demo-dates.js
 * Redistributes existing DemoOrder dates across the last 90 days evenly,
 * preserving the original chronological order (oldest stays oldest, newest stays newest).
 * Run standalone: node scripts/remap-demo-dates.js
 * Or imported: require('./scripts/remap-demo-dates').run()
 */
if (require.main === module) {
  require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
}
const mongoose = require('mongoose');
const DemoOrder = require('../models/DemoOrder');

function randInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }

async function run() {
  // If already connected (called from server.js), skip reconnect
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
  }
  console.log('[remap] Starting demo date remap…');

  const total = await DemoOrder.countDocuments();
  console.log(`[remap] ${total} orders found`);

  // Fetch all orders sorted oldest → newest
  const orders = await DemoOrder.find({}, { _id: 1, createdAt: 1 })
    .sort({ createdAt: 1 }).lean();

  const now      = Date.now();
  const winMs    = 90 * 86400000;              // 90 days in ms
  const startMs  = now - winMs;                // 90 days ago
  const endMs    = now - 86400000;             // yesterday (leave today as buffer)
  const rangeMs  = endMs - startMs;
  const n        = orders.length;

  console.log(`[remap] Remapping ${n} orders across last 90 days…`);

  // Map each order linearly: oldest → 90 days ago, newest → yesterday
  // Add ±2h jitter so daily bar chart looks natural
  const OPS = orders.map((o, i) => {
    const ratio    = n > 1 ? i / (n - 1) : 0.5;
    const baseMs   = startMs + ratio * rangeMs;
    const jitterMs = (Math.random() - 0.5) * 2 * 3600000 * 2; // ±2h
    const ts       = Math.min(Math.max(baseMs + jitterMs, startMs), endMs);
    const d        = new Date(ts);
    // Keep realistic business hours
    d.setHours(randInt(8, 22), randInt(0, 59), randInt(0, 59), 0);
    return {
      updateOne: {
        filter: { _id: o._id },
        update: { $set: { createdAt: d, updatedAt: new Date(d.getTime() + randInt(1,5) * 86400000) } }
      }
    };
  });

  // Bulk write in batches of 500
  const BATCH = 500;
  for (let i = 0; i < OPS.length; i += BATCH) {
    await DemoOrder.bulkWrite(OPS.slice(i, i + BATCH));
    process.stdout.write(`\r[remap] Updated ${Math.min(i + BATCH, OPS.length)}/${OPS.length}`);
  }

  console.log('\n[remap] Done ✓');

  // Summary
  const newest = await DemoOrder.findOne().sort({ createdAt: -1 }).lean();
  const oldest = await DemoOrder.findOne().sort({ createdAt:  1 }).lean();
  console.log(`[remap] Range: ${oldest.createdAt.toISOString().slice(0,10)} → ${newest.createdAt.toISOString().slice(0,10)}`);

  // Only disconnect when run standalone
  if (require.main === module) await mongoose.disconnect();
}

if (require.main === module) {
  run().catch(e => { console.error(e); process.exit(1); });
}
