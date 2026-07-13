// Find Indian D2C clothing leads via Instagram user search (apify/instagram-search-scraper)
// searchType:"user" searches Instagram accounts directly by keyword — no hashtags needed
require('dotenv').config();
const { connect } = require('../db');
const Lead = require('../models/Lead');

const TOKEN = process.env.APIFY_API_TOKEN;

// Search terms that surface Indian clothing brand accounts on Instagram
const SEARCH_TERMS = [
  'indian clothing brand',
  'india streetwear brand',
  'homegrown clothing india',
  'indian apparel brand',
  'india oversized tshirt',
  'india graphic tee brand',
  'india d2c fashion',
  'india fashion brand shop',
  'mumbai clothing brand',
  'delhi clothing brand',
  'bangalore clothing brand',
  'india drop clothing',
  'india limited edition clothing',
];

async function searchInstagramUsers(searchTerm) {
  console.log(`  Searching: "${searchTerm}"…`);
  const url = `https://api.apify.com/v2/acts/apify~instagram-search-scraper/run-sync-get-dataset-items?token=${TOKEN}&timeout=180&memory=256`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      search: searchTerm,
      searchType: 'user',
      searchLimit: 30,
    }),
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    console.log(`    ✗ ${r.status} ${txt.slice(0,200)}`);
    return [];
  }
  const data = await r.json();
  return Array.isArray(data) ? data : [];
}

function looksLikeBrand(profile) {
  const bio  = (profile.biography || profile.bio || '').toLowerCase();
  const name = (profile.fullName || profile.username || '').toLowerCase();
  const cat  = (profile.businessCategoryName || '').toLowerCase();

  const skipWords = [
    'influencer','blogger','model','photography','actor','actress','singer',
    'rapper','meme','news','media','magazine','page','reseller','hijab',
    'kids','children','baby','maternity','jewel','jewellery','electronics',
    'food','cafe','coffee','restaurant','game','gaming','fitness','gym',
  ];
  if (skipWords.some(w => bio.includes(w) || name.includes(w))) return false;

  // Business category signals
  const goodCats = ['clothing','shopping','retail','apparel','fashion','textile'];
  if (goodCats.some(w => cat.includes(w))) return true;

  const brandSignals = [
    'shop','store','brand','clothing','wear','apparel','tshirt','hoodie',
    'collection','drop','limited edition','cod','free shipping','₹','rs.',
    'dm to order','link in bio','buy now','streetwear','oversized','baggy',
    'graphic','unisex','premium','made in india','fashion','kurta','linen',
    'cotton','sustainable','slow fashion','outfit',
  ];
  return brandSignals.some(w => bio.includes(w));
}

function isLikelyIndian(profile) {
  const bio = (profile.biography || profile.bio || '').toLowerCase();
  const url = (profile.externalUrl || '').toLowerCase();
  const city = (profile.city || profile.location || '').toLowerCase();
  const indianSignals = [
    '₹','india','mumbai','delhi','bangalore','bengaluru','hyderabad',
    'chennai','pune','kolkata','jaipur','ahmedabad','.in','indian',
    'cod','cash on delivery','pan india','all india','bharat',
  ];
  return indianSignals.some(w => bio.includes(w) || url.includes(w) || city.includes(w));
}

async function run() {
  await connect();
  const existingSet = new Set((await Lead.find({}, 'handle').lean()).map(l => l.handle));
  console.log(`Existing leads: ${existingSet.size}\n`);

  const discovered = new Map(); // handle → profile

  for (const term of SEARCH_TERMS) {
    try {
      const results = await searchInstagramUsers(term);
      let found = 0;
      for (const p of results) {
        const handle = p.username;
        if (!handle || existingSet.has(handle) || discovered.has(handle)) continue;
        discovered.set(handle, p);
        found++;
      }
      console.log(`    → ${found} new profiles (total unique: ${discovered.size})`);
      await new Promise(r => setTimeout(r, 4000)); // be polite
    } catch (e) {
      console.log(`    ✗ error: ${e.message}`);
    }
  }

  console.log(`\nTotal unique candidates: ${discovered.size}`);
  console.log('Filtering by follower count, brand signals, Indian origin…\n');

  let added = 0, skipped = 0;

  for (const [handle, p] of discovered) {
    const followers = p.followersCount || p.followers || 0;
    if (followers < 5000 || followers > 20000) { skipped++; continue; }
    if (!looksLikeBrand(p))   { console.log(`  ✗ @${handle} — not a brand`); skipped++; continue; }
    if (!isLikelyIndian(p))   { console.log(`  ✗ @${handle} — not Indian`); skipped++; continue; }

    try {
      await Lead.findOneAndUpdate(
        { handle },
        {
          handle,
          name: p.fullName || handle,
          sector: p.businessCategoryName || 'Clothing & Apparel',
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
      console.log(`  ✓ @${handle} — ${p.fullName} (${followers.toLocaleString('en-IN')} followers)`);
    } catch (e) {
      console.log(`  ✗ DB error for @${handle}: ${e.message}`);
    }
  }

  console.log(`\n✓ Done — ${added} new leads added, ${skipped} skipped`);
  console.log(`Total leads in DB: ${await Lead.countDocuments()}`);
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
