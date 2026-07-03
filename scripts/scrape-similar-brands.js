// Find new D2C clothing leads by scraping who existing brands follow
// Brands follow other brands in the same niche — much higher signal than hashtags
require('dotenv').config();
const { connect } = require('../db');
const Lead = require('../models/Lead');

const TOKEN = process.env.APIFY_API_TOKEN;

// Seed accounts — established Indian streetwear/clothing brands we already know
// Scraping who THEY follow will surface similar brands
const SEED_HANDLES = [
  'mnmlstindia', 'bushirt.in', 'dynamocks', 'chuppslife', 'funkvibes.co',
  'vestirio_', 'bawse_official', 'roarfoxofficial', 'dopamean.in', 'crunkthread',
  'six5sixstreet', 'lovepangolin', 'theapparelbox', 'evemen.co', 'gochk.co',
  'insolecrew', '__struct', 'citidrip.in', '404tee.store', 'studiopostcard',
];

async function getFollowing(username) {
  console.log(`  Scraping @${username}'s following list…`);
  const url = `https://api.apify.com/v2/acts/louisdeconinck~instagram-following-scraper/run-sync-get-dataset-items?token=${TOKEN}&timeout=120`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usernames: [username], resultsLimit: 200 }),
  });
  if (!r.ok) { console.log(`    ✗ ${r.status} ${await r.text().catch(()=>'')}`); return []; }
  const data = await r.json();
  return data.map(d => d.username || d.handle).filter(Boolean);
}

async function scrapeProfiles(usernames) {
  if (!usernames.length) return [];
  console.log(`  Fetching ${usernames.length} profiles…`);
  const url = `https://api.apify.com/v2/acts/apify~instagram-profile-scraper/run-sync-get-dataset-items?token=${TOKEN}&timeout=120`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usernames, resultsLimit: usernames.length }),
  });
  if (!r.ok) { console.log(`    ✗ ${r.status}`); return []; }
  return r.json();
}

function looksLikeBrand(profile) {
  const bio  = (profile.biography || '').toLowerCase();
  const name = (profile.fullName || profile.username || '').toLowerCase();

  // Skip personal accounts, influencers, non-Indian brands
  const skipWords = [
    'influencer','blogger','model','photography','actor','actress','singer',
    'rapper','meme','news','media','magazine','page','reseller','hijab',
    'kids','children','baby','maternity','bridal','saree','lehenga',
    'jewel','jewellery','electronics','food','cafe','coffee','restaurant',
  ];
  if (skipWords.some(w => bio.includes(w) || name.includes(w))) return false;

  // Must have brand/shop signals
  const brandSignals = [
    'shop','store','brand','clothing','wear','apparel','tshirt','hoodie',
    'collection','drop','limited edition','cod','free shipping','₹','rs.',
    'dm to order','link in bio','buy now','streetwear','oversized','baggy',
    'graphic','unisex','premium','made in india',
  ];
  return brandSignals.some(w => bio.includes(w));
}

function isLikelyIndian(profile) {
  const bio = (profile.biography || '').toLowerCase();
  const url = (profile.externalUrl || '').toLowerCase();
  const indianSignals = [
    '₹','india','mumbai','delhi','bangalore','bengaluru','hyderabad',
    'chennai','pune','kolkata','jaipur','ahmedabad','.in','indian',
    'cod','cash on delivery','pan india','all india',
  ];
  return indianSignals.some(w => bio.includes(w) || url.includes(w));
}

async function run() {
  await connect();
  const existingSet = new Set((await Lead.find({}, 'handle').lean()).map(l => l.handle));
  console.log(`Existing leads: ${existingSet.size}`);
  console.log(`Scraping following lists of ${SEED_HANDLES.length} seed accounts…\n`);

  // Frequency map — the more seeds follow someone, the more likely they're a brand
  const freq = new Map();

  for (const seed of SEED_HANDLES) {
    try {
      const following = await getFollowing(seed);
      let newFound = 0;
      for (const handle of following) {
        if (existingSet.has(handle) || handle === seed) continue;
        freq.set(handle, (freq.get(handle) || 0) + 1);
        newFound++;
      }
      console.log(`    → found ${newFound} new handles (total unique: ${freq.size})\n`);
      await new Promise(r => setTimeout(r, 3000));
    } catch (e) { console.log(`    ✗ ${e.message}\n`); }
  }

  // Sort by frequency — accounts followed by multiple seed brands are highest signal
  const ranked = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 300) // top 300 candidates
    .map(([h]) => h);

  console.log(`\nTop candidates (by how many seed brands follow them): ${ranked.length}`);
  console.log('Top 10:', ranked.slice(0, 10).join(', '), '\n');

  let added = 0, skipped = 0;

  // Profile-check in batches of 20
  for (let i = 0; i < ranked.length; i += 20) {
    const batch = ranked.slice(i, i + 20);
    try {
      const profiles = await scrapeProfiles(batch);
      for (const p of profiles) {
        const handle = p.username;
        const followers = p.followersCount || p.followers || 0;
        if (!handle || existingSet.has(handle)) { skipped++; continue; }
        if (followers < 5000 || followers > 20000)  { skipped++; continue; }
        if (!looksLikeBrand(p))                      { skipped++; continue; }
        if (!isLikelyIndian(p))                      { skipped++; continue; }

        await Lead.findOneAndUpdate(
          { handle },
          {
            handle,
            name: p.fullName || handle,
            sector: 'Clothing & Apparel',
            category: 'Clothing & Apparel',
            avatar: p.profilePicUrl || p.profilePicUrlHD || null,
            website: p.externalUrl || null,
            followers,
            status: 'new',
          },
          { upsert: true }
        );
        existingSet.add(handle);
        added++;
        console.log(`  ✓ @${handle} — ${p.fullName} (${followers.toLocaleString('en-IN')} followers, followed by ${freq.get(handle)} seeds)`);
      }
      await new Promise(r => setTimeout(r, 3000));
    } catch (e) { console.log(`  ✗ batch error: ${e.message}`); }
  }

  console.log(`\n✓ Done — ${added} new leads added, ${skipped} skipped`);
  console.log(`Total leads: ${await Lead.countDocuments()}`);
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
