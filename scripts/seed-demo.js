/**
 * seed-demo.js — Import Croscrow SQLite orders → Antortiq MongoDB DemoOrder collection
 * Run: node scripts/seed-demo.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const Database = require('better-sqlite3');
const mongoose = require('mongoose');
const DemoOrder = require('../models/DemoOrder');

const SQLITE_PATH = process.env.CROSCROW_DB ||
  require('path').join(require('os').homedir(), 'Desktop/jarvis-shopify-backup-2026-07-29/croscrow.db');

const VENDORS = [
  { name: 'DRIP STUDIOS', pct: 25, weight: 26 },
  { name: 'SICOS',        pct: 30, weight: 19 },
  { name: 'FLYJONE',      pct: 26, weight: 16 },
  { name: 'Odd Affair',   pct: 20, weight: 14 },
  { name: '2WENT6EX',     pct: 28, weight: 12 },
  { name: 'AHEGAS',       pct: 20, weight: 8  },
  { name: 'BOOZEE',       pct: 20, weight: 5  },
];

const PRODUCTS = [
  'Oversized Acid Wash Tee','Cargo Utility Shorts','Box-Fit Hoodie','Relaxed Chinos',
  'Patchwork Denim Jacket','Ribbed Tank Top','Y2K Track Pants','Crewneck Sweatshirt',
  'Washed Baggy Jeans','Graphic Print Tee','Fleece Zip-Up Hoodie','Wide-Leg Cord Trousers',
  'Tie-Dye Camp Shirt','Knit Polo','Distressed Denim Shorts','Drop-Shoulder Bomber',
  'Mesh Jersey Top','Vintage Wash Joggers','Linen Button-Down Shirt','Nylon Wind Jacket',
  'Raw Hem Flare Jeans','French Terry Shorts','Varsity Jacket','Ribbed Crop Top',
  'Twill Worker Jacket','Quarter-Zip Pullover','Pleated Trousers','Shacket Overshirt',
  'Thermal Henley','Printed Bucket Hat',
];

const CUSTOMERS = [
  ['Rahul Sharma','9876543210'],['Priya Verma','9123456789'],['Amit Singh','9988776655'],
  ['Sneha Gupta','8765432109'],['Rohit Patel','9654321098'],['Anjali Nair','8543210987'],
  ['Vikram Mehta','9432109876'],['Pooja Joshi','8321098765'],['Arun Kumar','9210987654'],
  ['Divya Shah','8109876543'],['Karan Malhotra','9001234567'],['Simran Kaur','8890123456'],
  ['Nikhil Rao','9789012345'],['Meera Pillai','8678901234'],['Akash Yadav','9567890123'],
  ['Riya Kapoor','8456789012'],['Deepak Bose','9345678901'],['Nisha Sinha','8234567890'],
  ['Suresh Reddy','9123456780'],['Kavya Menon','8012345679'],['Arjun Desai','9901234568'],
  ['Shreya Dubey','8890123457'],['Manish Thakur','9779012346'],['Ananya Chauhan','8668901235'],
  ['Siddharth Jain','9557890124'],['Pallavi Mishra','8446789013'],['Tarun Saxena','9335678902'],
  ['Ritu Aggarwal','8224567891'],['Gaurav Tiwari','9113456780'],['Priyanka Bajaj','8002345679'],
];

const COURIERS = ['Delhivery','Ekart','Xpressbees','Shadowfax','DTDC','Bluedart','Ecom Express'];

function pickWeighted(arr) {
  const total = arr.reduce((s, v) => s + v.weight, 0);
  let r = Math.random() * total;
  for (const v of arr) { r -= v.weight; if (r <= 0) return v; }
  return arr[arr.length - 1];
}

function randInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
function randItem(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randAWB() { return `${randItem(['DL','XB','SF','EK','DD'])}${randInt(1000000000,9999999999)}`; }

function generateRevenue(stage, paymentType) {
  const base = randInt(599, 2999);
  // round to nearest 99/49/00 for realistic look
  const endings = [99, 199, 299, 399, 499, 649, 799, 899, 999, 1199, 1299, 1499, 1699, 1799, 1999, 2199, 2499, 2799, 2999];
  return randItem(endings.filter(p => p <= 2999 && p >= 599));
}

function generateDates(count) {
  // Spread over last 120 days with recency bias
  const now = new Date();
  const dates = [];
  for (let i = 0; i < count; i++) {
    // Exponential distribution: more recent orders
    const u = Math.random();
    const daysAgo = Math.floor(-Math.log(1 - u * 0.9) * 25);
    const d = new Date(now - Math.min(daysAgo, 120) * 86400000);
    // Add random time within the day
    d.setHours(randInt(8, 22), randInt(0, 59), randInt(0, 59));
    dates.push(d);
  }
  return dates.sort((a, b) => b - a); // newest first
}

async function run() {
  console.log('[seed] Connecting to MongoDB…');
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });

  const existing = await DemoOrder.countDocuments();
  if (existing > 0) {
    console.log(`[seed] ${existing} demo orders already exist. Drop first? Re-running will add duplicates.`);
    console.log('[seed] Clearing existing demo orders…');
    await DemoOrder.deleteMany({});
  }

  console.log('[seed] Reading SQLite…');
  const db = new Database(SQLITE_PATH, { readonly: true });
  const rows = db.prepare('SELECT * FROM order_meta ORDER BY shopify_id ASC').all();
  const settlementMap = {};
  db.prepare('SELECT * FROM settlement_orders').all().forEach(r => {
    settlementMap[r.shopify_order_id] = r;
  });
  db.close();

  console.log(`[seed] Processing ${rows.length} orders…`);
  const dates = generateDates(rows.length);

  // Base order number — start from a realistic Shopify order number
  const baseOrderNum = 1001;

  const docs = rows.map((row, i) => {
    const settled = settlementMap[row.shopify_id];
    const vendor = pickWeighted(VENDORS);
    const [customerName, customerPhone] = randItem(CUSTOMERS);
    const createdAt = dates[i];
    const updatedAt = new Date(createdAt.getTime() + randInt(1, 7) * 86400000);
    const product = randItem(PRODUCTS);
    const stage = row.stage;
    const paymentType = row.payment_type || 'cod';

    const myRevenue = settled ? settled.my_revenue : generateRevenue(stage, paymentType);
    const commissionPct = settled ? settled.commission_pct : vendor.pct;

    // AWB for dispatched stages
    const dispatched = ['ready','pickup','transit','ofd','delivered','rto'].includes(stage);
    const awb = row.awb || (dispatched ? randAWB() : '');
    const courier = row.courier || (dispatched ? randItem(COURIERS) : '');

    return {
      shopifyId:     row.shopify_id,
      orderName:     settled?.order_name || `#${baseOrderNum + i}`,
      stage,
      paymentType,
      advancePaid:   row.advance_paid || 0,
      myRevenue,
      vendorName:    vendor.name,
      commissionPct,
      awb,
      courier,
      productName:   product,
      customerName,
      customerPhone,
      createdAt,
      updatedAt,
    };
  });

  // Insert in batches
  const BATCH = 100;
  for (let i = 0; i < docs.length; i += BATCH) {
    await DemoOrder.insertMany(docs.slice(i, i + BATCH));
    process.stdout.write(`\r[seed] Inserted ${Math.min(i + BATCH, docs.length)}/${docs.length}`);
  }
  console.log('\n[seed] Done ✓');

  // Print summary
  const byStage = await DemoOrder.aggregate([{ $group: { _id: '$stage', count: { $sum: 1 }, revenue: { $sum: '$myRevenue' } } }]);
  byStage.sort((a, b) => b.count - a.count);
  console.log('\nStage breakdown:');
  byStage.forEach(s => console.log(`  ${s._id}: ${s.count} orders, ₹${s.revenue.toLocaleString()}`));

  await mongoose.disconnect();
}

run().catch(e => { console.error(e); process.exit(1); });
