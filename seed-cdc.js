require('dotenv').config();
const mongoose = require('mongoose');

const PRODUCTS = [
  { name: 'CDC OG Tee',           price: 1299, vendor: 'Tiruppur Knits Co.' },
  { name: 'Crep Dog Hoodie',      price: 2999, vendor: 'Delhi Stitch House' },
  { name: 'CDC Varsity Jacket',   price: 4499, vendor: 'Mumbai Print Works' },
  { name: 'Crep Dog Joggers',     price: 1799, vendor: 'Bangalore Fabric Studio' },
  { name: 'CDC Cap',              price: 699,  vendor: 'Chennai Cut & Sew' },
  { name: 'Crep Dog Jersey',      price: 1999, vendor: 'Jaipur Dye House' },
  { name: 'CDC Cargo Pants',      price: 2499, vendor: 'Surat Weave Works' },
  { name: 'Crep Dog Bomber',      price: 3999, vendor: 'Ahmedabad Apparel Co.' },
  { name: 'CDC Crew Neck',        price: 1599, vendor: 'Kolkata Garments Hub' },
  { name: 'Crep Dog Wind Jacket', price: 3499, vendor: 'Pune Stitch Collective' },
];

const CITIES = [
  ['Mumbai','Maharashtra'],['Delhi','Delhi'],['Bangalore','Karnataka'],
  ['Chennai','Tamil Nadu'],['Hyderabad','Telangana'],['Pune','Maharashtra'],
  ['Kolkata','West Bengal'],['Ahmedabad','Gujarat'],['Jaipur','Rajasthan'],
  ['Lucknow','Uttar Pradesh'],['Chandigarh','Punjab'],['Indore','Madhya Pradesh'],
  ['Surat','Gujarat'],['Nagpur','Maharashtra'],['Kochi','Kerala'],
];

// 500 orders: 175 delivered, 100 shipped, 75 confirmed, 50 pending, 50 packed, 25 rto, 25 cancelled
const STAGE_LIST = [
  ...Array(175).fill('delivered'),
  ...Array(100).fill('transit'),
  ...Array(75).fill('confirmed'),
  ...Array(50).fill('pending'),
  ...Array(50).fill('ready'),
  ...Array(25).fill('rto'),
  ...Array(25).fill('cancelled'),
];

function rnd(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randDate(daysAgo) {
  const ms = Date.now() - rnd(0, daysAgo) * 86400000 - rnd(0, 86400000);
  return new Date(ms);
}
function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const CUSTNAMES = [
  'Aryan Shah','Rohan Mehta','Priya Nair','Kabir Singh','Ananya Gupta',
  'Vikram Joshi','Sneha Patel','Dev Malhotra','Ishaan Verma','Aditya Rao',
  'Tanya Khanna','Siddharth Bose','Neha Sharma','Ravi Kumar','Pooja Iyer',
  'Arnav Chatterjee','Shruti Sinha','Kunal Bajaj','Meera Pillai','Harsh Thakur',
];

// ── Orders ────────────────────────────────────────────────────────────────────
function generateOrders() {
  const stageList = shuffleArray(STAGE_LIST);
  const orders = [];
  let rawTotal = 0;

  for (let i = 0; i < 500; i++) {
    const stage = stageList[i];
    const isPrepaid = Math.random() < 0.30;
    const itemCount = rnd(1, 3);
    const lineItems = [];

    for (let j = 0; j < itemCount; j++) {
      const p = pick(PRODUCTS);
      const qty = rnd(1, 2);
      lineItems.push({
        id: 1000000 + i * 10 + j,
        title: p.name,
        vendor: p.vendor,
        qty,
        price: p.price,
        sku: `CDC-${p.name.replace(/\s+/g,'-').toUpperCase().slice(0,8)}-${rnd(100,999)}`,
        variant: ['S','M','L','XL','XXL'][rnd(0,4)],
        product_id: 900000 + PRODUCTS.indexOf(p) * 100,
      });
    }

    const orderValue = lineItems.reduce((s, li) => s + li.price * li.qty, 0);
    rawTotal += orderValue;

    const vendors = [...new Set(lineItems.map(li => li.vendor))];
    const vendorStages = {};
    vendors.forEach(v => { vendorStages[v] = stage; });

    const [city, state] = pick(CITIES);
    const orderId = 1001 + i;
    const custName = pick(CUSTNAMES);
    const createdAt = randDate(180);
    const dateStr = createdAt.toISOString().split('T')[0];

    orders.push({
      id: `#${orderId}`,
      shopifyId: String(orderId),
      customer: custName,
      email: `${custName.toLowerCase().replace(/\s/g, '.')}@email.com`,
      phone: `9${rnd(100000000, 999999999)}`,
      date: dateStr,
      created_at: createdAt.toISOString(),
      orderValue,
      myRevenue: orderValue,
      shippingCharge: isPrepaid ? 0 : 99,
      currency: 'INR',
      stage,
      vendorStages,
      vendors,
      vendorTracking: ['transit','delivered'].includes(stage)
        ? Object.fromEntries(vendors.map(v => [v, { awb: `DLV${rnd(1000000,9999999)}`, courier: pick(['Delhivery','Shiprocket','Ekart','XpressBees']), trackingUrl: '' }]))
        : {},
      vendorPenalty: {},
      confirmedPenalties: {},
      lineItems,
      paymentType: isPrepaid ? 'prepaid' : 'cod',
      advancePaid: 0,
      notes: '',
      awb: ['transit','delivered'].includes(stage) ? `DLV${rnd(1000000,9999999)}` : '',
      courier: ['transit','delivered'].includes(stage) ? pick(['Delhivery','Shiprocket','Ekart','XpressBees']) : '',
      trackingUrl: '',
      deliveryStatus: stage === 'delivered' ? 'Delivered' : stage === 'rto' ? 'RTO' : stage === 'transit' ? 'In Transit' : '',
      fulfillment: ['transit','delivered'].includes(stage) ? 'fulfilled' : stage === 'cancelled' ? 'cancelled' : 'unfulfilled',
      financial: isPrepaid ? 'paid' : 'pending',
      tags: isPrepaid ? 'prepaid' : 'cod',
      shippingAddress: { city, province: state, country: 'India' },
      settlementStatus: stage === 'delivered' && Math.random() > 0.4 ? 'paid' : null,
      shopifyFulfilled: ['transit','delivered'].includes(stage),
      ccStock: null,
    });
  }

  // Scale to ₹12L GMV
  const scale = 1200000 / rawTotal;
  orders.forEach(o => {
    o.orderValue = Math.round(o.orderValue * scale);
    o.myRevenue  = o.orderValue;
    o.lineItems.forEach(li => { li.price = Math.round(li.price * scale); });
  });

  orders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return orders;
}

// ── Analytics (matches JARVIS /admin/analytics shape exactly) ─────────────────
function generateAnalytics(orders) {
  const delivered  = orders.filter(o => o.stage === 'delivered');
  const rto        = orders.filter(o => o.stage === 'rto');
  const transit    = orders.filter(o => o.stage === 'transit');
  const confirmed  = orders.filter(o => o.stage === 'confirmed');
  const pending    = orders.filter(o => o.stage === 'pending');
  const ready      = orders.filter(o => o.stage === 'ready');
  const cancelled  = orders.filter(o => o.stage === 'cancelled');

  const totalGMV = orders.reduce((s, o) => s + o.orderValue, 0);
  const commission = Math.round(totalGMV * 0.12);

  // Stage counts (used by sc = a.stageCounts)
  const stageCounts = {
    delivered: delivered.length,
    transit: transit.length,
    confirmed: confirmed.length,
    pending: pending.length,
    ready: ready.length,
    rto: rto.length,
    cancelled: cancelled.length,
    new: 0, pickup: 0, ofd: 0, hold: 0, partial: 0, misc: 0,
  };

  // All time totals (used by at = a.allTimeTotals)
  const allTimeTotals = {
    revenue: totalGMV,
    periodRevenue: totalGMV,
    totalCommission: commission,
    totalCommissionGst: Math.round(commission * 0.18),
    orders: orders.length,
  };

  // Period summary (last 30d approx)
  const now = Date.now();
  const period30 = orders.filter(o => new Date(o.created_at) >= new Date(now - 29 * 86400000));
  const period30Rev = period30.reduce((s, o) => s + o.orderValue, 0);
  const today = orders.filter(o => o.date === new Date().toISOString().split('T')[0]);
  const last7d = orders.filter(o => new Date(o.created_at) >= new Date(now - 6 * 86400000));

  const summary = {
    today: {
      orders: today.length || rnd(3, 8),
      revenue: today.reduce((s, o) => s + o.orderValue, 0) || rnd(5000, 15000),
    },
    last7d: {
      orders: last7d.length,
      revenue: last7d.reduce((s, o) => s + o.orderValue, 0),
      aov: last7d.length ? Math.round(last7d.reduce((s, o) => s + o.orderValue, 0) / last7d.length) : 2400,
    },
    period: {
      orders: period30.length,
      revenue: period30Rev,
      aov: period30.length ? Math.round(period30Rev / period30.length) : 2400,
      from: new Date(now - 29 * 86400000).toISOString().slice(0, 10),
      to: new Date().toISOString().slice(0, 10),
      days: 30,
    },
    revenueGrowth: 18.4,
    orderGrowth: 12.7,
    rtoRate30: Math.round(rto.length / orders.length * 100),
    repeatRate: 18,
    totalCustomers: 412,
    repeatCustomers: 74,
  };

  // Fulfillment stats (used by a.fulfillStats)
  const activeOrders = orders.filter(o => !['rto','cancelled'].includes(o.stage));
  const dispatchedOrders = orders.filter(o => ['ready','transit','delivered'].includes(o.stage));
  const fulfillStats = {
    total: orders.length,
    active: activeOrders.length,
    dispatched: dispatchedOrders.length,
    delivered: delivered.length,
    rto: rto.length,
    cancelled: cancelled.length,
    dispatch_rate: Math.round(dispatchedOrders.length / activeOrders.length * 100),
    delivery_rate: Math.round(delivered.length / orders.length * 100),
    rto_rate: Math.round(rto.length / orders.length * 100),
    stageMap: stageCounts,
    revDispatched: dispatchedOrders.reduce((s, o) => s + o.orderValue, 0),
    revPending: pending.reduce((s, o) => s + o.orderValue, 0),
    revDelivered: delivered.reduce((s, o) => s + o.orderValue, 0),
    revRto: rto.reduce((s, o) => s + o.orderValue, 0),
    revNotConfirmed: pending.reduce((s, o) => s + o.orderValue, 0),
    revCancelled: cancelled.reduce((s, o) => s + o.orderValue, 0),
    dispatchRate: Math.round(dispatchedOrders.length / orders.length * 100),
  };

  // Top products
  const productSales = {};
  orders.forEach(o => {
    o.lineItems.forEach(li => {
      if (!productSales[li.title]) productSales[li.title] = { qty: 0, revenue: 0 };
      productSales[li.title].qty += li.qty;
      productSales[li.title].revenue += li.price * li.qty;
    });
  });
  const topProducts = Object.entries(productSales)
    .map(([title, d]) => ({ title, total_sales: d.qty, revenue: d.revenue }))
    .sort((a, b) => b.revenue - a.revenue);

  // Top cities
  const citySales = {};
  orders.forEach(o => {
    const c = o.shippingAddress?.city || 'Unknown';
    if (!citySales[c]) citySales[c] = { orders: 0, revenue: 0 };
    citySales[c].orders++;
    citySales[c].revenue += o.orderValue;
  });
  const topCities = Object.entries(citySales)
    .map(([city, d]) => ({ city, orders: d.orders, revenue: d.revenue }))
    .sort((a, b) => b.orders - a.orders).slice(0, 8);

  // 14-day trend
  const trend14d = [];
  for (let d = 13; d >= 0; d--) {
    const dayStart = new Date(now - d * 86400000); dayStart.setHours(0,0,0,0);
    const dayEnd   = new Date(now - d * 86400000); dayEnd.setHours(23,59,59,999);
    const dayOrds  = orders.filter(o => { const dt = new Date(o.created_at); return dt >= dayStart && dt <= dayEnd; });
    trend14d.push({
      date: dayStart.toISOString().slice(0, 10),
      orders: dayOrds.length,
      revenue: dayOrds.reduce((s, o) => s + o.orderValue, 0),
    });
  }

  // Payment split
  const prepaidOrders = orders.filter(o => o.paymentType === 'prepaid');
  const codOrders = orders.filter(o => o.paymentType !== 'prepaid');
  const paymentSplit = {
    prepaid: { count: prepaidOrders.length, revenue: prepaidOrders.reduce((s, o) => s + o.orderValue, 0) },
    cod:     { count: codOrders.length,     revenue: codOrders.reduce((s, o) => s + o.orderValue, 0) },
  };

  // Vendor leaderboard
  const vendorMap = {};
  orders.forEach(o => {
    o.vendors.forEach(v => {
      if (!vendorMap[v]) vendorMap[v] = { orders: 0, delivered: 0, rto: 0, revenue: 0 };
      vendorMap[v].orders++;
      if (o.stage === 'delivered') vendorMap[v].delivered++;
      if (o.stage === 'rto') vendorMap[v].rto++;
      vendorMap[v].revenue += o.orderValue;
    });
  });
  const vendorLeaderboard = Object.entries(vendorMap)
    .map(([name, d]) => ({ vendor: name, orders: d.orders, delivered: d.delivered, rto: d.rto, revenue: d.revenue, deliveryRate: Math.round(d.delivered / d.orders * 100) }))
    .sort((a, b) => b.revenue - a.revenue);

  return {
    summary, stageCounts, allTimeTotals, fulfillStats,
    topProducts, topCities, trend14d, paymentSplit, vendorLeaderboard,
    totalOrders: orders.length,
    revenueGrowth: 18.4,
    dispatchQuality: { total: orders.length, veryGoodPct: 42, goodPct: 28, finePct: 18, badPct: 8, veryBadPct: 4, avgHours: 26 },
  };
}

// ── Vendors (20) ──────────────────────────────────────────────────────────────
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
    const score = Math.round((deliveryRate * 40) + ((1 - rtoRate) * 30) + ((6 - dispatchDays) / 5 * 30));
    const status = score >= 75 ? 'active' : score >= 55 ? 'warning' : 'paused';
    return {
      id: i + 1, name, city: pick(cityNames),
      category: categories[i % categories.length],
      orders_handled: handled,
      delivered: Math.round(deliveryRate * 100),
      rto_rate: Math.round(rtoRate * 100),
      avg_dispatch_days: dispatchDays,
      score, revenue_share: rnd(20000, 180000),
      active_products: rnd(5, 40), status,
      stats: {
        total_orders: handled, delivered: Math.round(deliveryRate * handled),
        rto_count: Math.round(rtoRate * handled), rto_rate: Math.round(rtoRate * 100),
        revenue: rnd(200000, 1800000), not_dispatched: rnd(0, 5),
        cancelled: rnd(0, 10), penalty_count: rnd(0, 3), delay_count: rnd(0, 8),
        aov: rnd(1800, 3500), deliveryRate: Math.round(deliveryRate * 100),
      },
    };
  });
}

// ── Brain insights ────────────────────────────────────────────────────────────
function generateBrain() {
  return [
    // ── Orders & RTO ──────────────────────────────────────────────────────────
    { id:1,  type:'warning',     priority:'high',   section:'orders',    title:'Assam, Bihar & AP = 40% of total RTO orders',      body:'Assam (18%), Bihar (13%) and Andhra Pradesh (9%) together account for 40% of all RTO. These are high-risk COD zones. Recommend enabling mandatory prepaid-only or delivery confirmation IVR for these states.',    metric:'RTO Concentration', change:'3 states · 40% RTO' },
    { id:2,  type:'action',      priority:'high',   section:'orders',    title:'12 orders stuck in Ready-to-Ship for 4+ days',     body:'12 orders have been in "Ready to Ship" for over 4 days without dispatch. Vendors: Kanpur Textile House (4 orders), Indore Print Lab (5 orders), Nagpur Craft Co. (3 orders). Immediate follow-up required — penalty clock is running.',  metric:'Stuck Orders',      change:'4+ days' },
    { id:3,  type:'warning',     priority:'high',   section:'orders',    title:'COD cancellation rate at 9.2% — above safe zone',  body:'9.2% of all COD orders are cancelled before dispatch. Leading reason: "customer unreachable" (54%), "changed mind" (31%). Address IVR confirmation before dispatch to halve this rate and recover ~₹42K/month.',          metric:'COD Cancellations', change:'9.2%' },
    { id:4,  type:'trend',       priority:'medium', section:'orders',    title:'Avg dispatch time dropped from 3.8d → 2.1d',       body:'Average vendor dispatch time improved by 44% this month. Top contributors: Delhi Stitch House (1.2 day avg), Tiruppur Knits Co. (1.4 day avg). Maintain pressure on laggards — Kanpur Textile still at 4.8 days.',             metric:'Dispatch Speed',    change:'-44%' },

    // ── Inventory & Ads Catalog ───────────────────────────────────────────────
    { id:5,  type:'warning',     priority:'high',   section:'inventory', title:'CDC Cargo Pants live in ads — only XL left, 15 days', body:'CDC Cargo Pants has been running in your active Meta catalog for 15 days but only XL size remains in stock. You are spending ad budget driving traffic to a near-OOS product. Pause this SKU from the catalog immediately or restock within 48 hours.',  metric:'Catalog Waste',     change:'15 days · XL only' },
    { id:6,  type:'opportunity', priority:'high',   section:'inventory', title:'CDC Varsity Jacket — 34 wishlists, 0 stock',         body:'CDC Varsity Jacket has 0 units available but 34 customers have it wishlisted. At ₹4,499 MRP, a 50-unit restock triggers ₹2.25L in addressable demand on day 1. Set up a pre-order or waitlist campaign now.',                               metric:'Restock Opportunity',change:'₹2.25L day-1' },
    { id:7,  type:'opportunity', priority:'high',   section:'inventory', title:'CDC Cap — 3.1x ATC ratio, ideal gift bundle target', body:'CDC Cap shows a 3.1x Add-to-Cart ratio during evening hours (6 PM–10 PM). This is a gifting behaviour signal. Bundling Cap + Tee at ₹1,799 or running a "Gift a Crep Dog" campaign can unlock ₹40K–60K incremental monthly revenue.',    metric:'Gift Potential',    change:'3.1x ATC' },

    // ── Pixel & Scalability ───────────────────────────────────────────────────
    { id:8,  type:'opportunity', priority:'high',   section:'revenue',   title:'Crep Dog Jersey: 35% view-to-checkout — scale now', body:'Crep Dog Jersey is showing a 35% view-to-checkout conversion rate, which is 2.8x above platform average (12.4%). This is a strong signal of product-market fit. Increase ad spend on this SKU by 2x and test a reels-first creative approach.',  metric:'View→Checkout',     change:'35% · 2.8x avg' },
    { id:9,  type:'opportunity', priority:'medium', section:'revenue',   title:'Crep Dog Hoodie — 12-day sellout, restock campaign', body:'Hoodie sold out in 12 days after last restock. Historical repeat purchase rate for this SKU is 24%. A pre-launch waitlist email to 187 past buyers + ₹10K Meta spend on interest retargeting can generate ₹2L+ in revenue within 24h of restock.',  metric:'Sellout Velocity',  change:'12-day sellout' },
    { id:10, type:'trend',       priority:'medium', section:'revenue',   title:'Weekend orders 40% above weekday baseline',         body:'Saturday and Sunday consistently generate 40% more orders than weekdays. Your current ad scheduling runs flat 7-day. Shifting 30% of weekly budget to Fri 8PM–Sun 10PM could yield ₹18K–25K additional revenue per month at same spend.',           metric:'Weekend Lift',      change:'+40% on Sat–Sun' },

    // ── Customers & Retention ─────────────────────────────────────────────────
    { id:11, type:'action',      priority:'medium', section:'customers', title:'74 customers gone cold — win-back window closing',  body:'74 customers placed exactly one order 90+ days ago and have not returned. Their average first-order value was ₹2,610. A personalised "We miss you" WhatsApp with 10% off expires in 7 days can recover 18–22 orders (~₹47K) based on cohort benchmarks.',  metric:'Lapsed Buyers',     change:'74 customers · 90d' },
    { id:12, type:'trend',       priority:'low',    section:'customers', title:'Repeat customer rate: 18% — strong for D2C',        body:'91 customers ordered twice or more. 18% repeat rate is above the Indian D2C apparel benchmark of 12%. Key retention driver: customers who bought CDC OG Tee reorder at 3x the rate. Leverage this as a gateway SKU in new customer campaigns.',       metric:'Repeat Rate',       change:'18% vs 12% benchmark' },

    // ── Vendors & Finance ─────────────────────────────────────────────────────
    { id:13, type:'warning',     priority:'medium', section:'vendors',   title:'3 vendors above 12% RTO — review scorecards',      body:'Kanpur Textile House (14.3%), Indore Print Lab (13.1%) and Nagpur Craft Co. (12.8%) breach the 12% RTO threshold. Combined they handle 187 orders/month. Issue formal performance warnings and reduce order allocation by 30% until the next review cycle.',  metric:'Vendor RTO',        change:'3 vendors · 12%+ RTO' },
    { id:14, type:'action',      priority:'medium', section:'vendors',   title:'6 vendor settlements overdue beyond 21 days',       body:'Vendors: Surat Weave Works, Ahmedabad Apparel Co., Coimbatore Loom Works, Kanpur Textile House, Vadodara Stitch Co. and Kochi Coastal Wear are past the 21-day settlement SLA. Delayed payouts risk vendor disengagement and slower dispatches heading into peak season.',  metric:'Overdue Payouts',   change:'6 vendors · 21d+' },
    { id:15, type:'trend',       priority:'low',    section:'revenue',   title:'Prepaid share grew from 22% → 30% this month',      body:'Prepaid order share rose 8 points driven by Instagram Reels campaigns targeting 18–24 male segment. Prepaid orders have 0% RTO vs 11.2% for COD. Every 1% shift to prepaid saves ~₹12K/month in RTO losses and improves settlement speed by 4 days.',   metric:'Prepaid Shift',     change:'+8 points' },
  ];
}

// ── Pixel data ────────────────────────────────────────────────────────────────
function generatePixel() {
  const products = PRODUCTS.map(p => {
    const views     = rnd(600, 2000);
    const atc       = Math.round(views * rnd(10, 25) / 100);
    const checkout  = Math.round(atc  * rnd(40, 70) / 100);
    const purchases = Math.round(checkout * rnd(30, 60) / 100);
    const revenue   = purchases * p.price;
    return {
      name: p.name, views, atc, checkout, purchases, revenue,
      atc_rate: Math.round(atc / views * 100),
      purchase_rate: Math.round(purchases / views * 100),
    };
  });
  const summary = {
    views:    products.reduce((s, p) => s + p.views, 0),
    atc:      products.reduce((s, p) => s + p.atc, 0),
    checkout: products.reduce((s, p) => s + p.checkout, 0),
    purchases:products.reduce((s, p) => s + p.purchases, 0),
    revenue:  products.reduce((s, p) => s + p.revenue, 0),
    viewToAtcRate:           Math.round(products.reduce((s,p)=>s+p.atc,0)/products.reduce((s,p)=>s+p.views,0)*100),
    atcToCheckoutRate:       Math.round(products.reduce((s,p)=>s+p.checkout,0)/products.reduce((s,p)=>s+p.atc,0)*100),
    checkoutToPurchaseRate:  Math.round(products.reduce((s,p)=>s+p.purchases,0)/products.reduce((s,p)=>s+p.checkout,0)*100),
    viewToPurchaseRate:      Math.round(products.reduce((s,p)=>s+p.purchases,0)/products.reduce((s,p)=>s+p.views,0)*100),
    purchaseValue: products.reduce((s, p) => s + p.revenue, 0),
  };
  return { summary, products };
}

// ── Meta Ads ──────────────────────────────────────────────────────────────────
function generateMeta() {
  const campaigns = [
    { id:1, name:'CDC OG Collection — Catalog',        status:'active',  spend:69400,  revenue:501600,  roas:7.24, purchases:241, cpp:288, reach:166000, frequency:4.2, impressions:697200, clicks:17952, ctr:2.57, cpm:99,  adsets:3 },
    { id:2, name:'Crep Dog Hoodie Launch — Reels',     status:'active',  spend:56400,  revenue:327600,  roas:5.81, purchases:174, cpp:324, reach:279000, frequency:2.8, impressions:781200, clicks:22356, ctr:2.86, cpm:72,  adsets:2 },
    { id:3, name:'CDC Drop 2025 — Broad Retarget',     status:'active',  spend:45700,  revenue:441050,  roas:9.65, purchases:220, cpp:208, reach:168000, frequency:4.3, impressions:722100, clicks:18975, ctr:2.63, cpm:63,  adsets:4 },
    { id:4, name:'Sales // Streetwear // Mar',         status:'active',  spend:60100,  revenue:421500,  roas:7.02, purchases:231, cpp:260, reach:241000, frequency:3.0, impressions:723000, clicks:18075, ctr:2.50, cpm:83,  adsets:3 },
    { id:5, name:'CDC Winter Collection // Jan',       status:'paused',  spend:12900,  revenue:99500,   roas:7.71, purchases:45,  cpp:288, reach:58000,  frequency:2.4, impressions:139200, clicks:3618,  ctr:2.60, cpm:93,  adsets:2 },
    { id:6, name:'Sales // May Mix — 3 Creatives',    status:'paused',  spend:31500,  revenue:238200,  roas:7.56, purchases:125, cpp:252, reach:145000, frequency:2.6, impressions:377000, clicks:9804,  ctr:2.60, cpm:84,  adsets:3 },
    { id:7, name:'New Sales — 3 Cats Live',            status:'paused',  spend:20400,  revenue:150400,  roas:7.37, purchases:71,  cpp:287, reach:92000,  frequency:2.6, impressions:239200, clicks:6220,  ctr:2.60, cpm:85,  adsets:2 },
    { id:8, name:'CDC Sweatpants S1 // Jan',           status:'paused',  spend:37100,  revenue:205400,  roas:5.54, purchases:97,  cpp:383, reach:223000, frequency:2.4, impressions:535200, clicks:13917, ctr:2.60, cpm:69,  adsets:2 },
    { id:9, name:'New Sales Campaign 11',              status:'paused',  spend:27800,  revenue:142300,  roas:5.12, purchases:70,  cpp:397, reach:116000, frequency:3.2, impressions:371200, clicks:9649,  ctr:2.60, cpm:75,  adsets:2 },
    { id:10,name:'Northstory Broad // 07 Jan',         status:'draft',   spend:5000,   revenue:64700,   roas:12.94,purchases:22,  cpp:227, reach:59000,  frequency:1.3, impressions:76700,  clicks:1994,  ctr:2.60, cpm:65,  adsets:1 },
  ];

  const ageGender = [
    { age:'18–24', gender:'male',    spend:240000, revenue:1576500, roas:6.57, purchases:786, cpp:305, atc:5265, ctr:2.94 },
    { age:'25–34', gender:'male',    spend:153000, revenue:937000,  roas:6.12, purchases:467, cpp:328, atc:2495, ctr:2.61 },
    { age:'18–24', gender:'female',  spend:15300,  revenue:93500,   roas:6.10, purchases:42,  cpp:365, atc:312,  ctr:3.02 },
    { age:'35–44', gender:'male',    spend:24900,  revenue:135200,  roas:5.43, purchases:58,  cpp:429, atc:345,  ctr:2.41 },
    { age:'45–54', gender:'male',    spend:9000,   revenue:36200,   roas:4.02, purchases:17,  cpp:530, atc:137,  ctr:2.18 },
    { age:'25–34', gender:'female',  spend:7200,   revenue:26100,   roas:3.63, purchases:11,  cpp:651, atc:66,   ctr:2.22 },
    { age:'55–64', gender:'male',    spend:2100,   revenue:16100,   roas:7.63, purchases:7,   cpp:301, atc:43,   ctr:2.55 },
    { age:'35–44', gender:'unknown', spend:150,    revenue:1400,    roas:9.55, purchases:1,   cpp:150, atc:5,    ctr:0.0  },
    { age:'65+',   gender:'male',    spend:2200,   revenue:7600,    roas:3.42, purchases:5,   cpp:444, atc:40,   ctr:2.11 },
    { age:'Unknown',gender:'unknown',spend:0,      revenue:1300,    roas:0,    purchases:1,   cpp:0,   atc:2,    ctr:0.0  },
  ];

  const platform = [
    { name:'📘 Facebook Feed',     spend:183000, revenue:1185600, roas:6.48, purchases:589, cpp:311, reach:1400000, impressions:4800000, ctr:2.41 },
    { name:'📸 Instagram Feed',    spend:112000, revenue:780400,  roas:6.97, purchases:412, cpp:272, reach:980000,  impressions:2900000, ctr:3.12 },
    { name:'🎥 Instagram Reels',   spend:85400,  revenue:536400,  roas:6.28, purchases:247, cpp:346, reach:610000,  impressions:1800000, ctr:3.87 },
    { name:'📖 Facebook Stories',  spend:32100,  revenue:138300,  roas:4.31, purchases:89,  cpp:361, reach:280000,  impressions:690000,  ctr:1.92 },
    { name:'🔍 Audience Network',  spend:18700,  revenue:62500,   roas:3.34, purchases:55,  cpp:340, reach:198000,  impressions:540000,  ctr:1.24 },
  ];

  const interests = [
    { rank:'🥇', name:'Sneakers & Streetwear',        roas:9.46, revenue:210000, spend:22200, cpp:206, purchases:108, adsets:2, ctr:2.94 },
    { rank:'🥈', name:'Urban Fashion (18–24)',          roas:8.91, revenue:196000, spend:22000, cpp:214, purchases:103, adsets:3, ctr:3.01 },
    { rank:'🥉', name:'Hip Hop / Rap Culture',         roas:8.44, revenue:184000, spend:21800, cpp:218, purchases:100, adsets:2, ctr:2.87 },
    { rank:'',   name:'Online Shopping (retail)',       roas:9.15, revenue:220000, spend:24000, cpp:209, purchases:112, adsets:4, ctr:2.94 },
    { rank:'',   name:'Luxury Goods',                   roas:7.80, revenue:172000, spend:22100, cpp:246, purchases:90,  adsets:2, ctr:2.71 },
    { rank:'',   name:'Skateboarding / BMX',            roas:7.24, revenue:159000, spend:22000, cpp:253, purchases:87,  adsets:2, ctr:2.65 },
    { rank:'',   name:'Music Festivals',                roas:6.98, revenue:154000, spend:22000, cpp:261, purchases:84,  adsets:2, ctr:2.58 },
    { rank:'',   name:'Fitness & Gym (18–24)',           roas:6.72, revenue:148000, spend:22000, cpp:272, purchases:81,  adsets:3, ctr:2.52 },
    { rank:'',   name:'NBA / Basketball',               roas:6.41, revenue:141000, spend:22000, cpp:285, purchases:77,  adsets:2, ctr:2.44 },
    { rank:'',   name:'Gaming (Mobile & PC)',            roas:5.94, revenue:131000, spend:22000, cpp:307, purchases:72,  adsets:2, ctr:2.31 },
    { rank:'',   name:'Tattoos & Body Art',              roas:5.54, revenue:122000, spend:22000, cpp:329, purchases:67,  adsets:2, ctr:2.19 },
    { rank:'',   name:'Discount Stores (value buyers)',  roas:4.81, revenue:106000, spend:22000, cpp:379, purchases:58,  adsets:2, ctr:1.98 },
  ];

  const summary = {
    totalSpend:    campaigns.reduce((s,c)=>s+c.spend, 0),
    totalRevenue:  campaigns.reduce((s,c)=>s+c.revenue, 0),
    avgRoas:       parseFloat((campaigns.filter(c=>c.roas>0).reduce((s,c)=>s+c.roas,0)/campaigns.filter(c=>c.roas>0).length).toFixed(2)),
    totalPurchases:campaigns.reduce((s,c)=>s+c.purchases, 0),
    totalAtc:      ageGender.reduce((s,r)=>s+r.atc, 0),
    totalCheckout: Math.round(ageGender.reduce((s,r)=>s+r.atc, 0) * 0.40),
    totalReach:    platform.reduce((s,p)=>s+p.reach, 0),
    totalImpressions: platform.reduce((s,p)=>s+p.impressions, 0),
    avgFrequency:  3.07,
    totalClicks:   campaigns.reduce((s,c)=>s+c.clicks, 0),
    avgCpm:        51,
    avgCpc:        2,
    avgCtr:        2.65,
    totalOrders:   campaigns.reduce((s,c)=>s+c.purchases, 0),
  };

  return { campaigns, ageGender, platform, interests, summary, insights: campaigns };
}

// ── Settlements ────────────────────────────────────────────────────────────────
function generateSettlements(vendors) {
  const settlements = [];
  const periods = [
    { id:'S-001', label:'June 2026',  from:'2026-06-01', to:'2026-06-30' },
    { id:'S-002', label:'July 2026',  from:'2026-07-01', to:'2026-07-31' },
    { id:'S-003', label:'August 2026',from:'2026-08-01', to:'2026-08-04' },
  ];
  periods.forEach(period => {
    vendors.slice(0, 20).forEach((v, i) => {
      const orders_count = rnd(8, 45);
      const gross = rnd(40000, 180000);
      const commission = Math.round(gross * 0.12);
      const gst = Math.round(commission * 0.18);
      const shipping = rnd(2000, 8000);
      const net = gross - commission - gst - shipping;
      settlements.push({
        id: `${period.id}-V${i+1}`,
        period: period.label, period_from: period.from, period_to: period.to,
        vendor_name: v.name, orders_count, gross, commission, gst,
        shipping_deduction: shipping, net_payable: net,
        status: period.id === 'S-001' ? 'paid' : period.id === 'S-002' ? (Math.random() > 0.3 ? 'paid' : 'pending') : 'processing',
      });
    });
  });
  return settlements;
}

// ── Support chatbot findings ───────────────────────────────────────────────────
function generateSupport() {
  return [
    { id:1,  category:'order_status', question:'Where is my order?',             count:234, resolution_rate:94, avg_response_time:'45s',  csat:4.2 },
    { id:2,  category:'delivery',     question:'My order is delayed',             count:189, resolution_rate:78, avg_response_time:'2m',   csat:3.6 },
    { id:3,  category:'returns',      question:'How do I return/exchange?',       count:142, resolution_rate:88, avg_response_time:'1m10s', csat:4.0 },
    { id:4,  category:'product',      question:'Is this available in my size?',   count:121, resolution_rate:91, avg_response_time:'30s',  csat:4.4 },
    { id:5,  category:'order_status', question:'I haven\'t received my AWB',      count:98,  resolution_rate:85, avg_response_time:'1m',   csat:3.9 },
    { id:6,  category:'delivery',     question:'Wrong item received',             count:67,  resolution_rate:72, avg_response_time:'3m',   csat:3.3 },
    { id:7,  category:'returns',      question:'Refund not received yet',         count:58,  resolution_rate:81, avg_response_time:'2m30s', csat:3.7 },
    { id:8,  category:'product',      question:'What\'s the fabric/material?',    count:44,  resolution_rate:97, avg_response_time:'25s',  csat:4.6 },
    { id:9,  category:'order_status', question:'Can I change my delivery address?',count:39, resolution_rate:64, avg_response_time:'4m',   csat:3.2 },
    { id:10, category:'delivery',     question:'Order marked delivered but not received', count:31, resolution_rate:76, avg_response_time:'5m', csat:2.9 },
    { id:11, category:'product',      question:'Do you restock sold out items?',  count:28,  resolution_rate:95, avg_response_time:'20s',  csat:4.5 },
    { id:12, category:'returns',      question:'Can I cancel my order?',          count:22,  resolution_rate:88, avg_response_time:'1m',   csat:4.1 },
  ];
}

// ── Cross-tool operational findings (shown on dashboard Quick Findings panel) ──
function generateFindings() {
  return [
    // WhatsApp Bot
    {
      id: 'wa-001',
      tool: 'WhatsApp Bot',
      toolIcon: '💬',
      severity: 'critical',
      category: 'customer_escalation',
      title: 'Harsh (Order #2678) — 3 days unresolved exchange request',
      body: 'Customer Harsh has messaged the bot 7 times over 3 days regarding an exchange for the CDC Cargo Pants (size M → L). Bot marked it resolved after first message but issue was never actioned. Customer is now asking for a refund. Requires manual intervention today.',
      action: 'Open chat → Escalate to team',
      timestamp: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 'wa-002',
      tool: 'WhatsApp Bot',
      toolIcon: '💬',
      severity: 'warning',
      category: 'delivery_escalation',
      title: '6 customers reporting "delivered but not received" in past 48h',
      body: '6 orders marked delivered by courier (Delhivery, Ekart) but customers deny receipt. All 6 are from UP and Bihar — possible courier scan fraud zone. Bot is auto-closing these with a "contact courier" response. Needs manual follow-up and courier escalation raised.',
      action: 'Review orders → Raise courier dispute',
      timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 'wa-003',
      tool: 'WhatsApp Bot',
      toolIcon: '💬',
      severity: 'info',
      category: 'pattern',
      title: '"Size guide" is the #1 pre-purchase question (89 asks this week)',
      body: '89 customers asked "what size should I pick?" before placing an order this week. Bot is falling back to a generic reply. Adding a size-recommendation flow with chest/height input could reduce size-related returns by an estimated 30% and improve CSAT from 3.6 → 4.2.',
      action: 'Build size-quiz bot flow',
      timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
    },
    // RTO Intelligence
    {
      id: 'rto-001',
      tool: 'RTO Intelligence',
      toolIcon: '🔴',
      severity: 'critical',
      category: 'rto_pattern',
      title: 'Assam, Bihar & AP — 40% of all RTO orders, 3 states',
      body: 'Assam (18%), Bihar (13%), Andhra Pradesh (9%) are generating 40% of total RTO despite contributing only 14% of order volume. The RTO rate in these states is 31% vs 8.4% national average. All 3 are predominantly COD. Immediate action: add IVR confirmation before dispatch for these pincodes.',
      action: 'Enable IVR for these states',
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 'rto-002',
      tool: 'RTO Intelligence',
      toolIcon: '🔴',
      severity: 'warning',
      category: 'rto_pattern',
      title: 'CDC Cargo Pants has 3.8x the average RTO rate',
      body: 'CDC Cargo Pants (SKU: CDC-CP-001) has a 34% RTO rate vs 9% product average. Root cause analysis: 72% of RTOs cite "size not fitting" — returns after delivery. Recommend adding size advisory in post-order WA message specifically for this SKU to reduce returns.',
      action: 'Add size advisory for SKU CDC-CP-001',
      timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 'rto-003',
      tool: 'RTO Intelligence',
      toolIcon: '🔴',
      severity: 'info',
      category: 'rto_trend',
      title: 'Orders placed on Sunday have 1.9x higher RTO than Mon–Fri',
      body: 'RTO rate on Sunday-placed orders is 16.8% vs 8.7% weekday average. Hypothesis: impulse purchases late night (11PM–2AM) show lower delivery intent. Consider adding a 2-hour COD hold for late-night Sunday orders to verify intent before processing.',
      action: 'Review Sunday night order rules',
      timestamp: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
    },
    // Inventory & Ads Catalog
    {
      id: 'inv-001',
      tool: 'Inventory & Ads',
      toolIcon: '🧥',
      severity: 'critical',
      category: 'catalog_waste',
      title: 'CDC Cargo Pants live in Meta catalog — only XL left, 15 days wasted spend',
      body: 'CDC Cargo Pants has been running in the active Meta product catalog for 15 days. Only XL size remains in stock (3 units). You are spending ₹840/day driving traffic to a near-stockout product. Remove from catalog immediately. Estimated wasted spend: ₹12,600. Restock M/L within 5 days to re-activate.',
      action: 'Remove SKU from Meta catalog now',
      timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    },
    {
      id: 'inv-002',
      tool: 'Inventory & Ads',
      toolIcon: '🧥',
      severity: 'warning',
      category: 'restock_opportunity',
      title: 'CDC Varsity Jacket — 34 wishlists, 0 stock, losing ₹2L+ demand daily',
      body: 'CDC Varsity Jacket has been out of stock for 9 days. 34 customers have it wishlisted. At ₹4,499 ASP with a typical 60% wishlist-to-purchase conversion, a 50-unit restock could generate ₹91K in immediate revenue. Set up a pre-order with 10-day delivery promise to capture demand now.',
      action: 'Set up pre-order + notify waitlist',
      timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 'inv-003',
      tool: 'Inventory & Ads',
      toolIcon: '🧥',
      severity: 'info',
      category: 'bundle_opportunity',
      title: 'CDC Cap ATC spikes 3.1x on evenings — ideal gift bundle product',
      body: 'CDC Cap add-to-cart rate surges 3.1x between 6PM and 10PM, especially Saturday evenings. Purchase-alone rate is low (22%) but bundle purchase rate (Cap + Tee) is 61%. Suggests gifting behaviour. A "Gift a Crep Dog" bundle at ₹1,799 (Cap + CDC OG Tee) could unlock ₹40K–60K monthly.',
      action: 'Create gift bundle in Shopify',
      timestamp: new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString(),
    },
    // Pixel Tracker
    {
      id: 'pix-001',
      tool: 'Pixel Tracker',
      toolIcon: '📊',
      severity: 'critical',
      category: 'scale_signal',
      title: 'Crep Dog Jersey — 35% view-to-checkout, scale ad spend now',
      body: 'Crep Dog Jersey (SKU: CDC-JY-003) has a 35% view-to-checkout conversion rate — 2.8x the store average of 12.4%. This is a strong product-market fit signal. Current daily ad spend: ₹600. Recommended: scale to ₹1,500/day, test Reels-first creatives with sizing CTA, and add to the hero catalog slot.',
      action: 'Scale spend → Reels creative test',
      timestamp: new Date(Date.now() - 1.5 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 'pix-002',
      tool: 'Pixel Tracker',
      toolIcon: '📊',
      severity: 'warning',
      category: 'drop_off',
      title: 'CDC Bomber Jacket — 71% cart-to-checkout drop-off, price objection',
      body: 'CDC Bomber Jacket has the highest cart abandon rate in the catalog at 71% (store avg: 38%). Heatmap replay shows users exiting at the price reveal (₹5,999). A limited-time ₹200 off or 0% EMI option on this SKU could recover 25–30% of abandoned carts, estimated ₹28K/month.',
      action: 'Add EMI option or ₹200 discount',
      timestamp: new Date(Date.now() - 3.5 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: 'pix-003',
      tool: 'Pixel Tracker',
      toolIcon: '📊',
      severity: 'info',
      category: 'traffic_insight',
      title: 'Instagram → 68% of all traffic, but only 29% conversion share',
      body: 'Instagram drives 68% of sessions but only 29% of purchases. Facebook drives 12% of sessions but 41% of purchases — 3.4x more efficient per session. Consider shifting 15% of Instagram budget to Facebook retargeting, especially for the 25–34 male demographic where CDC performs strongest.',
      action: 'Rebalance Meta budget split',
      timestamp: new Date(Date.now() - 9 * 60 * 60 * 1000).toISOString(),
    },
  ];
}

// ── Seed ──────────────────────────────────────────────────────────────────────
async function seed() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) throw new Error('No MONGODB_URI in .env');

  await mongoose.connect(uri, { dbName: 'antortiq' });
  console.log('✅ Connected to MongoDB');

  const col = mongoose.connection.db.collection('cdc_demo');

  const orders  = generateOrders();
  const vendors = generateVendors();
  const analytics = generateAnalytics(orders);

  const doc = {
    _id: 'cdc_data',
    orders,
    vendors,
    analytics,
    brain:      generateBrain(),
    pixel:      generatePixel(),
    meta:       generateMeta(),
    settlements:generateSettlements(vendors),
    support:    generateSupport(),
    findings:   generateFindings(),
    stats: {
      period_revenue: orders.reduce((s, o) => s + o.orderValue, 0),
      orders: orders.length,
      delivered: orders.filter(o => o.stage === 'delivered').length,
      rto: orders.filter(o => o.stage === 'rto').length,
      commission: Math.round(orders.reduce((s, o) => s + o.orderValue, 0) * 0.12),
    },
    seeded_at: new Date(),
  };

  await col.replaceOne({ _id: 'cdc_data' }, doc, { upsert: true });
  const gmv = orders.reduce((s, o) => s + o.orderValue, 0);
  console.log(`✅ Seeded: ${orders.length} orders, GMV ₹${gmv.toLocaleString('en-IN')}, ${vendors.length} vendors`);
  await mongoose.disconnect();
}

seed().catch(e => { console.error('❌', e.message); process.exit(1); });
