// Re-fetch fresh Instagram avatar URLs for all leads via Apify
require('dotenv').config();
const { connect } = require('../db');
const Lead = require('../models/Lead');

const APIFY_TOKEN = process.env.APIFY_API_TOKEN;
const BATCH = 20; // Apify free tier handles ~20 per run comfortably
const DELAY = 2000;

async function fetchAvatars(handles) {
  const url = `https://api.apify.com/v2/acts/apify~instagram-profile-scraper/run-sync-get-dataset-items?token=${APIFY_TOKEN}&timeout=120`;
  const body = {
    usernames: handles,
    resultsLimit: handles.length,
  };
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Apify error: ${r.status} ${await r.text()}`);
  return r.json();
}

async function run() {
  await connect();
  const leads = await Lead.find({}).lean();
  console.log(`Refreshing avatars for ${leads.length} leads in batches of ${BATCH}…\n`);

  let updated = 0, failed = 0;

  for (let i = 0; i < leads.length; i += BATCH) {
    const batch = leads.slice(i, i + BATCH);
    const handles = batch.map(l => l.handle.replace(/^@/, ''));
    console.log(`Batch ${Math.floor(i/BATCH)+1}: ${handles.join(', ')}`);

    try {
      const results = await fetchAvatars(handles);
      for (const profile of results) {
        const handle = (profile.username || profile.handle || '').toLowerCase();
        const avatarUrl = profile.profilePicUrl || profile.profilePicUrlHD || profile.avatar;
        if (!avatarUrl) continue;

        const lead = await Lead.findOne({ handle: { $regex: new RegExp(`^${handle}$`, 'i') } });
        if (lead) {
          lead.avatar = avatarUrl;
          await lead.save();
          updated++;
          console.log(`  ✓ ${handle}`);
        }
      }
    } catch (err) {
      console.error(`  ✗ Batch failed: ${err.message}`);
      failed += batch.length;
    }

    if (i + BATCH < leads.length) await new Promise(r => setTimeout(r, DELAY));
  }

  console.log(`\nDone — ${updated} updated, ${failed} failed`);
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
