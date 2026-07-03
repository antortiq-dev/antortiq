// Discover new D2C clothing leads (5k-20k followers) via Apify Instagram hashtag scraper
require('dotenv').config();
const { connect } = require('../db');
const Lead = require('../models/Lead');

const TOKEN = process.env.APIFY_API_TOKEN;

// Hashtags targeting Indian D2C streetwear/clothing brands
const HASHTAGS = [
  'homegrownbrandsindia',
  'homegrownclothing',
  'oversizedtshirtindia',
  'oversizedindia',
  'baggyindia',
  'indianoversize',
  'streetwearindiaofficial',
  'indiestreetfashion',
  'droptshirt',
  'limitededitionindia',
  'graphicteesindia',
  'independentbrandindia',
  'desistreetfashion',
  'mumbaistreetfashion',
  'delhistreetfashion',
];

async function scrapeHashtag(hashtag) {
  console.log(`  Scraping #${hashtag}…`);
  const url = `https://api.apify.com/v2/acts/apify~instagram-hashtag-scraper/run-sync-get-dataset-items?token=${TOKEN}&timeout=90`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hashtags: [hashtag], resultsLimit: 50 }),
  });
  if (!r.ok) { console.log(`    ✗ ${r.status}`); return []; }
  return r.json();
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
  const bio = (profile.biography || '').toLowerCase();
  const name = (profile.fullName || profile.username || '').toLowerCase();
  // Skip personal accounts, influencers, aggregators
  const skipWords = ['influencer','blogger','model','photography','studio photos','page','meme','news','media','magazine','actor','actress','singer','rapper'];
  if (skipWords.some(w => bio.includes(w) || name.includes(w))) return false;
  // Prefer brand signals
  const brandSignals = ['shop','store','brand','clothing','wear','apparel','tshirt','hoodie','collection','drop','dm to order','link in bio','cod available','free shipping','worldwide shipping','₹','rs.','starting at'];
  return brandSignals.some(w => bio.includes(w));
}

async function run() {
  await connect();
  const existing = new Set((await Lead.find({}, 'handle').lean()).map(l => l.handle));
  console.log(`Existing leads: ${existing.size}\n`);

  const discovered = new Map(); // handle → username

  // Step 1: collect usernames from hashtag posts
  for (const tag of HASHTAGS) {
    try {
      const posts = await scrapeHashtag(tag);
      for (const post of posts) {
        const handle = post.ownerUsername || post.username;
        if (handle && !existing.has(handle) && !discovered.has(handle)) {
          discovered.set(handle, handle);
        }
      }
      console.log(`    → ${discovered.size} unique handles so far`);
      await new Promise(r => setTimeout(r, 2000));
    } catch (e) { console.log(`    ✗ ${e.message}`); }
  }

  const candidates = [...discovered.keys()];
  console.log(`\nTotal candidates to profile-check: ${candidates.length}\n`);

  let added = 0, skipped = 0;

  // Step 2: scrape profiles in batches of 20, filter 5k-20k
  for (let i = 0; i < candidates.length; i += 20) {
    const batch = candidates.slice(i, i + 20);
    try {
      const profiles = await scrapeProfiles(batch);
      for (const p of profiles) {
        const followers = p.followersCount || p.followers || 0;
        const handle = p.username;
        if (!handle || existing.has(handle)) { skipped++; continue; }
        if (followers < 5000 || followers > 20000) { skipped++; continue; }
        if (!looksLikeBrand(p)) { skipped++; continue; }

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
            sequence_start_at: null,
          },
          { upsert: true }
        );
        existing.add(handle);
        added++;
        console.log(`  ✓ @${handle} — ${followers.toLocaleString('en-IN')} followers`);
      }
      await new Promise(r => setTimeout(r, 3000));
    } catch (e) { console.log(`  ✗ batch error: ${e.message}`); }
  }

  console.log(`\nDone — ${added} new leads added, ${skipped} skipped`);
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
