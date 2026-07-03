// Scrape profiles from a curated list of Indian D2C clothing brand handles
// These are emerging/indie brands in the streetwear + apparel space, likely 5k-20k followers
require('dotenv').config();
const { connect } = require('../db');
const Lead = require('../models/Lead');

const TOKEN = process.env.APIFY_API_TOKEN;

// Curated handles — Indian indie/D2C clothing brands sourced from:
// - popular lookbooks, homegrown directories, brand aggregators
// - streetwear community recommendations
// Profile scraper will confirm follower counts and filter 5k-20k
const CANDIDATES = [
  // Streetwear / oversized / graphic tees
  'westees.in', 'inkmonk_official', 'tiltedlines', 'hypercollective_', 'dropzco',
  'memeculture.in', 'wokevault', 'saintshop.in', 'noiseandco', 'itsweekday',
  'brethren.in', 'theredback', 'dirtywears', 'bemodern.in', 'thejungly',
  'fabricanvas', 'solbari', 'brandblanksindia', 'untuckedofficial', 'inkastyle',
  'thinkbold.in', 'merchtable', 'thestudionine', 'ofcourseofficial', 'blueclearance',
  'thepetrichor.in', 'blankofficial',

  // Homegrown / indie fashion
  'blanky.co', 'beunbothered.in', 'theartmentshop', 'maate_wear', 'codesigns.in',
  'saltcoffeebrand', 'themulticlouds', 'tulmul', 'bascool', 'brutaindia',
  'guessbaba', 'saudara', 'patchwork.in', 'chikara.store', 'tintly',

  // Known D2C brands in similar follower range
  'snitch.co.in', 'beyoung.in', 'boohooman_in', 'urbanyog', 'thelocalbrand',
  'thehumanrace_', 'voidclub', 'earlyclubofficial', 'humanstudio_', 'blatantlybold',
  'weareloud.in', 'culturalindia', 'localitystore', 'theaestheticsco',
  'freestyleindia', 'urbancraft.in', 'thechapterone', 'clothsbythink',
  'madebythought', 'thesolidco', 'blockprint.in', 'rawcolorsco', 'garment.co',
  'junkfoodclothing_in', 'lostpatternco', 'theformstore', 'closedchapter.in',
  'prideandprestige', 'weekendbrand.in', 'theoffsetproject', 'slowthread',

  // More niche streetwear
  'thehyphenco', 'thebohopeople', 'notanapology', 'blurclothing', 'staticnoise.in',
  'thevoidco', 'fuzzyvault', 'madebyhuman.co', 'greymatters.in', 'thethriftcult',
  'secondsunrise.in', 'therangrezindia', 'kalamkari.studio', 'knotjustclothing',
  'basictheory.in', 'thesimplefactory', 'cottoncandyco.in', 'earthlingco.in',
  'naturebrand.in', 'sustainablethreads', 'slowfashionindia', 'rewear.in',

  // Female-forward D2C (still Clothing & Apparel)
  'blissclub.in', 'saltattire', 'theethnicco', 'jaipur_kurti', 'fabindia_',
  'anokhi_official', 'rangiloindia', 'craftsvilla', 'indianethnic_wear',
  'shein_in', 'mango_india', 'aw2.official', 'thebombaydreams',
  'plushbrand.in', 'theplushco', 'ambraee', 'karvati.in', 'vastraa.in',
];

async function scrapeProfiles(usernames) {
  if (!usernames.length) return [];
  console.log(`  Fetching ${usernames.length} profiles…`);
  const url = `https://api.apify.com/v2/acts/apify~instagram-profile-scraper/run-sync-get-dataset-items?token=${TOKEN}&timeout=120`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usernames, resultsLimit: usernames.length }),
  });
  if (!r.ok) { console.log(`  ✗ ${r.status} ${await r.text().catch(()=>'')}`); return []; }
  return r.json();
}

function looksLikeBrand(profile) {
  const bio  = (profile.biography || '').toLowerCase();
  const name = (profile.fullName || profile.username || '').toLowerCase();
  const skipWords = [
    'influencer','blogger','model','photography','actor','actress','singer',
    'rapper','meme','news','media','magazine','page','reseller','hijab',
    'kids','children','baby','maternity','jewel','jewellery','electronics',
    'food','cafe','coffee','restaurant','game','gaming',
  ];
  if (skipWords.some(w => bio.includes(w) || name.includes(w))) return false;
  const brandSignals = [
    'shop','store','brand','clothing','wear','apparel','tshirt','hoodie',
    'collection','drop','limited edition','cod','free shipping','₹','rs.',
    'dm to order','link in bio','buy now','streetwear','oversized','baggy',
    'graphic','unisex','premium','made in india','fashion','outfit','kurta',
    'ethnic','kurti','linen','cotton','sustainable','slow fashion',
  ];
  return brandSignals.some(w => bio.includes(w));
}

function isLikelyIndian(profile) {
  const bio = (profile.biography || '').toLowerCase();
  const url = (profile.externalUrl || '').toLowerCase();
  const indianSignals = [
    '₹','india','mumbai','delhi','bangalore','bengaluru','hyderabad',
    'chennai','pune','kolkata','jaipur','ahmedabad','.in','indian',
    'cod','cash on delivery','pan india','all india','bharat',
  ];
  return indianSignals.some(w => bio.includes(w) || url.includes(w));
}

async function run() {
  await connect();
  const existingSet = new Set((await Lead.find({}, 'handle').lean()).map(l => l.handle));
  console.log(`Existing leads: ${existingSet.size}`);

  const toScrape = CANDIDATES.filter(h => !existingSet.has(h));
  console.log(`Candidates to check (not in DB): ${toScrape.length}\n`);

  let added = 0, skipped = 0;

  for (let i = 0; i < toScrape.length; i += 25) {
    const batch = toScrape.slice(i, i + 25);
    try {
      const profiles = await scrapeProfiles(batch);
      for (const p of profiles) {
        const handle = p.username;
        const followers = p.followersCount || p.followers || 0;
        if (!handle || existingSet.has(handle)) { skipped++; continue; }
        if (followers < 5000 || followers > 20000) {
          console.log(`  ✗ @${handle} — ${followers.toLocaleString('en-IN')} followers (out of range)`);
          skipped++;
          continue;
        }
        if (!looksLikeBrand(p)) {
          console.log(`  ✗ @${handle} — doesn't look like a brand`);
          skipped++;
          continue;
        }
        if (!isLikelyIndian(p)) {
          console.log(`  ✗ @${handle} — doesn't look Indian`);
          skipped++;
          continue;
        }

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
        console.log(`  ✓ @${handle} — ${p.fullName} (${followers.toLocaleString('en-IN')} followers)`);
      }
      if (i + 25 < toScrape.length) await new Promise(r => setTimeout(r, 3000));
    } catch (e) { console.log(`  ✗ batch error: ${e.message}`); }
  }

  console.log(`\n✓ Done — ${added} new leads added, ${skipped} skipped`);
  console.log(`Total leads: ${await Lead.countDocuments()}`);
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
