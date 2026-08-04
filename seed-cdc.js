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
    { id:1,  type:'warning',     priority:'high',   section:'orders',    title:'High RTO in 3 cities',                    body:'73% of RTO orders come from Lucknow, Patna, and Agra. Consider COD restrictions for these pincodes.',              metric:'RTO Rate',         change:'+12%' },
    { id:2,  type:'opportunity', priority:'high',   section:'inventory', title:'CDC Varsity Jacket — restock alert',        body:'CDC Varsity Jacket has 0 units in stock but 34 active wishlists. Restocking 50 units = ₹1.5L+ opportunity.',      metric:'Wishlist Demand',  change:'34 wishlists' },
    { id:3,  type:'trend',       priority:'medium', section:'orders',    title:'Avg dispatch time improved',                body:'Avg dispatch time dropped from 3.8 days → 2.1 days this month. Top performers: Delhi Stitch House, Tiruppur Knits.', metric:'Dispatch Speed',   change:'-44%' },
    { id:4,  type:'opportunity', priority:'high',   section:'customers', title:'Repeat customer rate at 18%',               body:'91 customers ordered 2+ times. Remarketing campaigns targeting these buyers can drive 30% revenue uplift.',         metric:'Repeat Rate',      change:'18%' },
    { id:5,  type:'warning',     priority:'medium', section:'vendors',   title:'3 vendors exceeding 12% RTO',               body:'Kanpur Textile House (14%), Indore Print Lab (13%) and Nagpur Craft Co. (12.8%) need performance reviews.',          metric:'Vendor RTO',       change:'Above threshold' },
    { id:6,  type:'trend',       priority:'low',    section:'revenue',   title:'Prepaid orders up 8% this month',           body:'Prepaid orders grew from 22% to 30% of total. Lower RTO risk and faster settlement improve cash flow.',              metric:'Prepaid Share',    change:'+8%' },
    { id:7,  type:'action',      priority:'high',   section:'orders',    title:'12 orders stuck in "Ready" for 4+ days',    body:'12 orders flagged as "Ready to Ship" have not moved in 4+ days. Vendor follow-up needed immediately.',                metric:'Stuck Orders',     change:'4 days' },
    { id:8,  type:'opportunity', priority:'medium', section:'revenue',   title:'Weekend orders 40% higher',                 body:'Saturday-Sunday order volume is 40% above weekday average. Running weekend flash sales can push this further.',       metric:'Weekend Lift',     change:'+40%' },
    { id:9,  type:'trend',       priority:'low',    section:'orders',    title:'Mumbai & Delhi = 48% of orders',            body:'Mumbai (27%) and Delhi (21%) together account for nearly half of all orders. Strong metro concentration.',            metric:'City Concentration',change:'48%' },
    { id:10, type:'action',      priority:'medium', section:'vendors',   title:'Settlement pending for 6 vendors (>21 days)',body:'6 vendor settlements are overdue beyond 21 days. Release payments to maintain vendor trust and dispatch priority.',  metric:'Overdue Payouts',  change:'6 vendors' },
    { id:11, type:'warning',     priority:'high',   section:'orders',    title:'COD cancellation rate: 9.2%',               body:'9.2% of COD orders are cancelled before dispatch. Address verification and IVR confirmation can halve this.',         metric:'COD Cancellations',change:'9.2%' },
    { id:12, type:'opportunity', priority:'medium', section:'inventory', title:'CDC Cap is top gifting SKU',                 body:'CDC Cap has 3.1x ATC-to-purchase ratio during evenings. Promoted as a gift item, it can be a ₹40K/month add-on.',    metric:'ATC Ratio',        change:'3.1x' },
    { id:13, type:'trend',       priority:'low',    section:'revenue',   title:'AOV growth of ₹180 vs last quarter',        body:'Average order value grew from ₹2,210 to ₹2,390 in 3 months. Bundle promotions are working — continue the push.',     metric:'AOV',              change:'+₹180' },
    { id:14, type:'action',      priority:'low',    section:'customers', title:'74 customers not re-engaged in 90 days',    body:'74 customers who bought once have not returned in 90 days. A 10% off win-back email could recover 20+ orders.',       metric:'Lapsed Customers', change:'74' },
    { id:15, type:'opportunity', priority:'high',   section:'revenue',   title:'Crep Dog Hoodie — launch restock campaign', body:'Hoodie sold out in 12 days after last restock. Pre-launch campaign with waitlist can generate ₹2L in day-1 revenue.',  metric:'Velocity',         change:'12-day sellout' },
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
  return [
    { id:1, name:'CDC OG Collection',       status:'active',  spend:28000, revenue:89600,  roas:3.2, impressions:142000, clicks:3840, ctr:2.7, cpc:7.3, orders:38 },
    { id:2, name:'Crep Dog Hoodie Launch',  status:'active',  spend:45000, revenue:184500, roas:4.1, impressions:210000, clicks:5880, ctr:2.8, cpc:7.6, orders:61 },
    { id:3, name:'End of Season Sale',      status:'paused',  spend:18000, revenue:50400,  roas:2.8, impressions:98000,  clicks:2156, ctr:2.2, cpc:8.3, orders:24 },
    { id:4, name:'CDC Varsity Jacket Drop', status:'draft',   spend:0,     revenue:0,      roas:0,   impressions:0,      clicks:0,    ctr:0,   cpc:0,   orders:0  },
  ];
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
