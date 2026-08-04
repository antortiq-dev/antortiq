require('dotenv').config();
const mongoose = require('mongoose');

const PRODUCTS = [
  { name: 'CDC OG Tee',          price: 1299 },
  { name: 'Crep Dog Hoodie',     price: 2999 },
  { name: 'CDC Varsity Jacket',  price: 4499 },
  { name: 'Crep Dog Joggers',    price: 1799 },
  { name: 'CDC Cap',             price: 699  },
  { name: 'Crep Dog Jersey',     price: 1999 },
  { name: 'CDC Cargo Pants',     price: 2499 },
  { name: 'Crep Dog Bomber',     price: 3999 },
  { name: 'CDC Crew Neck',       price: 1599 },
  { name: 'Crep Dog Wind Jacket',price: 3499 },
];

const CITIES = [
  ['Mumbai','Maharashtra'],['Delhi','Delhi'],['Bangalore','Karnataka'],
  ['Chennai','Tamil Nadu'],['Hyderabad','Telangana'],['Pune','Maharashtra'],
  ['Kolkata','West Bengal'],['Ahmedabad','Gujarat'],['Jaipur','Rajasthan'],
  ['Lucknow','Uttar Pradesh'],['Chandigarh','Punjab'],['Indore','Madhya Pradesh'],
  ['Surat','Gujarat'],['Nagpur','Maharashtra'],['Kochi','Kerala'],
];

const STATUSES = [
  ...Array(175).fill('delivered'),
  ...Array(100).fill('shipped'),
  ...Array(75).fill('confirmed'),
  ...Array(50).fill('pending'),
  ...Array(50).fill('packed'),
  ...Array(25).fill('rto'),
  ...Array(25).fill('cancelled'),
];

function rnd(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function randDate(daysAgo) {
  const ms = Date.now() - rnd(0, daysAgo) * 86400000 - rnd(0, 86400000);
  return new Date(ms).toISOString();
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Orders ────────────────────────────────────────────────────────────────────
function generateOrders() {
  const statusList = shuffleArray(STATUSES);
  const orders = [];
  // We'll track total and scale at end
  let rawTotal = 0;

  for (let i = 0; i < 500; i++) {
    const status = statusList[i];
    const itemCount = rnd(1, 3);
    const items = [];
    for (let j = 0; j < itemCount; j++) {
      const p = pick(PRODUCTS);
      const qty = rnd(1, 2);
      items.push({ title: p.name, price: p.price, quantity: qty });
    }
    const total = items.reduce((s, it) => s + it.price * it.quantity, 0);
    rawTotal += total;

    const [city, state] = pick(CITIES);
    const isPrepaid = Math.random() < 0.30;
    const orderId = 1001 + i;
    const custNum = rnd(1000, 9999);

    const stageMap = {
      pending: 'pending', confirmed: 'confirmed', packed: 'packed',
      shipped: 'shipped', delivered: 'delivered', rto: 'rto', cancelled: 'cancelled'
    };

    orders.push({
      id: orderId,
      name: `#${orderId}`,
      customer_name: `Customer #${custNum}`,
      phone: `9${rnd(100000000, 999999999)}1`,
      email: `user${custNum}@example.com`,
      line_items: items,
      total_price: total,
      status,
      stage: stageMap[status],
      financial_status: isPrepaid ? 'paid' : 'pending',
      fulfillment_status: ['shipped','delivered'].includes(status) ? 'fulfilled' : status === 'cancelled' ? 'cancelled' : null,
      payment_type: isPrepaid ? 'prepaid' : 'COD',
      tags: isPrepaid ? 'prepaid' : 'cod',
      created_at: randDate(180),
      city,
      state,
      awb: ['shipped','delivered'].includes(status) ? `DLV${rnd(1000000, 9999999)}` : null,
      shipping_address: { city, province: state, country: 'India' },
    });
  }

  // Scale totals to hit ~₹11,00,000 GMV
  const scale = 1100000 / rawTotal;
  orders.forEach(o => {
    o.total_price = Math.round(o.total_price * scale);
    o.line_items.forEach(it => { it.price = Math.round(it.price * scale); });
  });

  // Sort by created_at desc
  orders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return orders;
}

// ── Vendors ───────────────────────────────────────────────────────────────────
function generateVendors() {
  const names = [
    'Tiruppur Knits Co.','Delhi Stitch House','Mumbai Print Works',
    'Bangalore Fabric Studio','Chennai Cut & Sew','Jaipur Dye House',
    'Surat Weave Works','Ahmedabad Apparel Co.','Kolkata Garments Hub',
    'Pune Stitch Collective','Hyderabad Thread & Needle','Indore Print Lab',
    'Kochi Coastal Wear','Nagpur Craft Co.','Ludhiana Knit House',
    'Gurgaon Apparel Works','Noida Print Studio','Coimbatore Loom Works',
    'Vadodara Stitch Co.','Kanpur Textile House',
  ];
  const categories = ['Tees','Hoodies','Jackets','Bottoms','Accessories','Knitwear'];
  const cityNames = CITIES.map(c => c[0]);

  return names.map((name, i) => {
    const handled = rnd(50, 300);
    const rtoRate = rnd(3, 15) / 100;
    const deliveryRate = rnd(70, 97) / 100;
    const dispatchDays = rnd(1, 5);
    const score = Math.round(
      (deliveryRate * 40) + ((1 - rtoRate) * 30) + ((6 - dispatchDays) / 5 * 30)
    );
    const status = score >= 75 ? 'active' : score >= 55 ? 'warning' : 'paused';

    return {
      id: i + 1,
      name,
      city: pick(cityNames),
      category: categories[i % categories.length],
      orders_handled: handled,
      delivered: Math.round(deliveryRate * 100),
      rto_rate: Math.round(rtoRate * 100),
      avg_dispatch_days: dispatchDays,
      score,
      revenue_share: rnd(20000, 180000),
      active_products: rnd(5, 40),
      status,
    };
  });
}

// ── Brain insights ────────────────────────────────────────────────────────────
function generateBrain() {
  return [
    { id:1, type:'warning',     priority:'high',   section:'orders',    title:'High RTO concentration in 3 cities', body:'73% of RTO orders come from Lucknow, Patna, and Agra. Consider enabling COD restrictions for these pin codes to reduce losses.', metric:'RTO Rate', change:'+12%' },
    { id:2, type:'opportunity', priority:'high',   section:'inventory', title:'CDC Varsity Jacket — restock alert', body:'CDC Varsity Jacket has 0 units in stock but 34 active wishlists. Restocking 50 units could unlock ₹1.5L+ in revenue.', metric:'Wishlist Demand', change:'34 wishlists' },
    { id:3, type:'trend',       priority:'medium', section:'orders',    title:'Dispatch time down 45% this month', body:'Average dispatch time improved from 3.8 days to 2.1 days this month, driven by Tiruppur Knits Co. and Delhi Stitch House improvements.', metric:'Avg Dispatch', change:'-1.7 days' },
    { id:4, type:'trend',       priority:'medium', section:'customers', title:'Repeat customer rate at 18%', body:'91 customers have placed 2+ orders. Top repeat buyers are from Bangalore and Mumbai. Consider a loyalty tier for 3+ orders.', metric:'Repeat Rate', change:'18%' },
    { id:5, type:'action',      priority:'high',   section:'revenue',   title:'Prepaid conversion opportunity', body:'Switching 15% more COD orders to prepaid (via UPI discounts) could save ₹45,000/month in RTO losses at current order volume.', metric:'COD Share', change:'70%' },
    { id:6, type:'opportunity', priority:'medium', section:'revenue',   title:'CDC Cap — bundle upsell potential', body:'CDC Cap (₹699) is bought standalone 89% of the time. Bundling with CDC OG Tee could increase average order value by ₹400+.', metric:'Standalone Rate', change:'89%' },
    { id:7, type:'warning',     priority:'medium', section:'vendors',   title:'3 vendors at warning status', body:'Delhi Stitch House, Kanpur Textile House, and Kochi Coastal Wear have RTO rates above 12%. Review their dispatch quality.', metric:'Vendor Health', change:'3 at risk' },
    { id:8, type:'trend',       priority:'low',    section:'orders',    title:'Weekend orders 34% higher', body:'Saturday–Sunday orders average 34% higher than weekday orders. Scheduling ad spend towards Thursday evening could capture more weekend intent.', metric:'Weekend Lift', change:'+34%' },
    { id:9, type:'action',      priority:'high',   section:'revenue',   title:'End of Season Sale ROAS declining', body:'End of Season Sale campaign ROAS dropped to 2.8x this week (from 3.4x). Consider refreshing creatives or tightening audience targeting.', metric:'ROAS', change:'-0.6x' },
    { id:10, type:'opportunity', priority:'medium', section:'customers', title:'Mumbai — highest LTV segment', body:'Mumbai customers have 2.1x higher lifetime value than the platform average. Increasing CAC budget for Mumbai by 20% is projected to be ROI positive.', metric:'Mumbai LTV', change:'2.1x avg' },
    { id:11, type:'trend',      priority:'low',    section:'inventory', title:'Hoodie sales up 28% MoM', body:'Crep Dog Hoodie is the fastest growing SKU — up 28% month-over-month. Ensure 120+ units in stock before the upcoming winter drop.', metric:'Hoodie Growth', change:'+28% MoM' },
    { id:12, type:'action',     priority:'medium', section:'vendors',   title:'Vendor settlement cycle can tighten', body:'Average settlement time is 18 days. Moving to bi-weekly settlements could improve vendor cash flow and reduce processing complaints by an estimated 40%.', metric:'Settlement Lag', change:'18 days' },
    { id:13, type:'warning',    priority:'high',   section:'orders',    title:'COD order cancellation spike — Mondays', body:'Monday COD orders have a 22% pre-dispatch cancellation rate vs 9% other days. Consider IVR confirmation for Monday COD orders above ₹2,000.', metric:'Mon COD Cancel', change:'22%' },
    { id:14, type:'trend',      priority:'low',    section:'revenue',   title:'Avg order value up ₹180 since Dec', body:'AOV has climbed from ₹1,840 to ₹2,020 over the past 6 months, driven by bundle adoption and the Varsity Jacket launch.', metric:'AOV', change:'+₹180' },
    { id:15, type:'opportunity', priority:'medium', section:'customers', title:'Win-back: 64 dormant customers', body:'64 customers who ordered in Jan–Feb have not reordered. A targeted WhatsApp campaign with a 10% code could recover 12–18 orders (est. ₹28,000).', metric:'Dormant Users', change:'64 customers' },
  ];
}

// ── Pixel tracker ─────────────────────────────────────────────────────────────
function generatePixel() {
  const totalViews = 12000;
  const products = PRODUCTS.map((p, i) => {
    const views = Math.round(totalViews * (0.05 + Math.random() * 0.15));
    const atc = Math.round(views * (0.08 + Math.random() * 0.12));
    const checkout = Math.round(atc * (0.50 + Math.random() * 0.20));
    const purchases = Math.round(checkout * (0.55 + Math.random() * 0.20));
    const revenue = purchases * p.price;
    return {
      name: p.name,
      views,
      atc,
      checkout,
      purchases,
      revenue,
      atc_rate: ((atc / views) * 100).toFixed(1),
      purchase_rate: ((purchases / views) * 100).toFixed(1),
    };
  });

  const summary = products.reduce((s, p) => ({
    views: s.views + p.views,
    atc: s.atc + p.atc,
    checkout: s.checkout + p.checkout,
    purchases: s.purchases + p.purchases,
    revenue: s.revenue + p.revenue,
  }), { views:0, atc:0, checkout:0, purchases:0, revenue:0 });

  return { summary, products };
}

// ── Meta Ads ──────────────────────────────────────────────────────────────────
function generateMeta() {
  return [
    { id:1, name:'CDC OG Collection', status:'active', spend:28000, revenue:89600, roas:3.2, impressions:185000, clicks:4200, ctr:2.27, cpc:6.67, orders:69 },
    { id:2, name:'Crep Dog Hoodie Launch', status:'active', spend:45000, revenue:184500, roas:4.1, impressions:310000, clicks:7800, ctr:2.52, cpc:5.77, orders:142 },
    { id:3, name:'End of Season Sale', status:'paused', spend:18000, revenue:50400, roas:2.8, impressions:125000, clicks:2900, ctr:2.32, cpc:6.21, orders:48 },
  ];
}

// ── Settlements ───────────────────────────────────────────────────────────────
function generateSettlements(vendors) {
  const periods = ['May 2026','Jun 2026','Jul 2026'];
  const statuses = ['paid','paid','processing'];
  const settlements = [];
  let sid = 1;

  periods.forEach((period, pi) => {
    vendors.slice(0, 20).forEach(v => {
      const orders_count = rnd(10, 60);
      const gross = Math.round(orders_count * rnd(1200, 3500));
      const commission = Math.round(gross * 0.12);
      const shipping = Math.round(orders_count * 85);
      const net = gross - commission - shipping;
      settlements.push({
        id: sid++,
        period,
        vendor_name: v.name,
        orders_count,
        gross,
        commission,
        shipping_deduction: shipping,
        net_payable: net,
        status: statuses[pi],
      });
    });
  });

  return settlements;
}

// ── Support ───────────────────────────────────────────────────────────────────
function generateSupport() {
  return [
    { id:1, category:'order_status', question:'Where is my order?', count:234, resolution_rate:94, avg_response_time:'1.2 min' },
    { id:2, category:'delivery',     question:'My order is delayed', count:118, resolution_rate:81, avg_response_time:'2.8 min' },
    { id:3, category:'returns',      question:'How do I return an item?', count:97, resolution_rate:88, avg_response_time:'1.9 min' },
    { id:4, category:'order_status', question:'I need to cancel my order', count:84, resolution_rate:76, avg_response_time:'3.1 min' },
    { id:5, category:'product',      question:'Is this product available in my size?', count:73, resolution_rate:62, avg_response_time:'4.2 min' },
    { id:6, category:'delivery',     question:'Wrong item delivered', count:61, resolution_rate:91, avg_response_time:'5.0 min' },
    { id:7, category:'returns',      question:'Refund not received', count:58, resolution_rate:84, avg_response_time:'6.3 min' },
    { id:8, category:'order_status', question:'Order shows delivered but not received', count:49, resolution_rate:79, avg_response_time:'7.1 min' },
    { id:9, category:'product',      question:'Product quality complaint', count:41, resolution_rate:72, avg_response_time:'8.5 min' },
    { id:10, category:'delivery',    question:'Change delivery address', count:38, resolution_rate:65, avg_response_time:'3.7 min' },
    { id:11, category:'order_status', question:'Duplicate charge', count:22, resolution_rate:96, avg_response_time:'2.2 min' },
    { id:12, category:'product',     question:'Size guide clarification', count:19, resolution_rate:99, avg_response_time:'0.8 min' },
  ];
}

// ── Dashboard stats ───────────────────────────────────────────────────────────
function generateStats(orders) {
  const now = new Date();
  const gmv_trend = [];
  const order_trend = [];

  for (let m = 5; m >= 0; m--) {
    const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
    const label = d.toLocaleString('en-IN', { month: 'short' }) + ' ' + d.getFullYear();
    const monthOrders = orders.filter(o => {
      const od = new Date(o.created_at);
      return od.getFullYear() === d.getFullYear() && od.getMonth() === d.getMonth();
    });
    gmv_trend.push({ month: label, gmv: monthOrders.reduce((s, o) => s + o.total_price, 0) });
    order_trend.push({ month: label, orders: monthOrders.length });
  }

  const delivered = orders.filter(o => o.status === 'delivered').length;
  const rto = orders.filter(o => o.status === 'rto').length;
  const gmv = orders.reduce((s, o) => s + o.total_price, 0);

  return {
    period_revenue: gmv,
    orders: orders.length,
    delivered,
    rto,
    commission: Math.round(gmv * 0.12),
    period: '6 months',
    gmv_trend,
    order_trend,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('[seed-cdc] Connecting to MongoDB…');
  await mongoose.connect(process.env.MONGO_URI);
  console.log('[seed-cdc] Connected');

  const orders = generateOrders();
  const vendors = generateVendors();
  const brain = generateBrain();
  const pixel = generatePixel();
  const meta = generateMeta();
  const settlements = generateSettlements(vendors);
  const support = generateSupport();
  const stats = generateStats(orders);

  const doc = {
    _id: 'cdc_data',
    orders,
    vendors,
    brain,
    pixel,
    meta,
    settlements,
    support,
    stats,
    seeded_at: new Date().toISOString(),
  };

  const db = mongoose.connection.db;
  const col = db.collection('cdc_demo');
  await col.replaceOne({ _id: 'cdc_data' }, doc, { upsert: true });

  const totalGMV = orders.reduce((s, o) => s + o.total_price, 0);
  console.log(`[seed-cdc] Saved cdc_data — ${orders.length} orders, GMV ₹${totalGMV.toLocaleString('en-IN')}`);
  await mongoose.disconnect();
  console.log('[seed-cdc] Done.');
}

main().catch(err => { console.error(err); process.exit(1); });
