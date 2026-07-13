// Find Indian clothing brand emails by scraping their websites directly
// No Apify needed — just fetch contact/about pages and extract emails
require('dotenv').config();
const { connect } = require('../db');
const Lead = require('../models/Lead');

// Curated list from Tracxn, Homegrown, Shopify directories, streetwear blogs
// Format: { handle, name, website }
const BRANDS = [
  // From Homegrown streetwear article
  { handle: 'balavofficial',         name: 'BALAV',               website: 'https://balavofficial.com' },
  { handle: 'prxkhxr',              name: 'Prakhar',             website: 'https://prxkhxr.com' },
  { handle: 'farakwear',            name: 'FARAK',               website: 'https://farakwear.com' },
  { handle: 'politesociety_official',name: 'Polite Society',     website: 'https://politesocietyshop.com' },
  { handle: 'walking__vertical',    name: 'Walking Vertical',    website: 'https://walkingvertical.com' },
  { handle: 'imlidana',             name: 'Imli Dana',           website: 'https://imlidana.com' },

  // From Shopify India lists
  { handle: 'fardaclothing',        name: 'Farda Clothing',      website: 'https://fardaclothing.com' },
  { handle: 'heartupmysleeves',     name: 'Heart Up My Sleeves', website: 'https://heartupmysleeves.com' },
  { handle: 'nonasties',            name: 'No Nasties',          website: 'https://www.nonasties.in' },
  { handle: 'suta.in',              name: 'Suta',                website: 'https://www.suta.in' },

  // From spocket / streetwear lists
  { handle: 'jaywalking.in',        name: 'Jaywalking',          website: 'https://jaywalking.in' },
  { handle: 'blor.official',        name: 'Blor',                website: 'https://blor.in' },
  { handle: 'burgerbaeclothing',    name: 'BurgerBae',           website: 'https://burgerbaeclothing.com' },
  { handle: 'letsbreakbounce',      name: 'Breakbounce',         website: 'https://www.breakbounce.com' },
  { handle: 'nattygarb',            name: 'Natty Garb',          website: 'https://nattygarb.com' },
  { handle: 'valkyreclothing',      name: 'Valkyre Clothing',    website: 'https://valkyreclothing.in' },
  { handle: 'wtflex.in',            name: 'WTFlex',              website: 'https://wtflex.in' },
  { handle: 'fugazee',              name: 'Fugazee',             website: 'https://fugazee.com' },
  { handle: 'shopcapsul',           name: 'Capsul',              website: 'https://shopcapsul.com' },
  { handle: 'biskit',               name: 'Biskit',              website: 'https://spacebiskit.com' },
  { handle: 'fearnoman',            name: 'Fear No Man',         website: 'https://fearnomangear.com' },

  // From qikink top D2C list
  { handle: 'thebearhouse',         name: 'The Bear House',      website: 'https://www.thebearhouse.in' },
  { handle: 'damensch',             name: 'DaMensch',            website: 'https://damensch.com' },
  { handle: 'zymrat',               name: 'Zymrat',              website: 'https://zymrat.com' },
  { handle: 'redwolfstore',         name: 'Redwolf',             website: 'https://www.redwolf.in' },
  { handle: 'beyoung.in',           name: 'Beyoung',             website: 'https://www.beyoung.in' },
  { handle: 'frankly_wearing',      name: 'Frankly Wearing',     website: 'https://franklywearing.com' },
  { handle: 'bombaytrooper',        name: 'Bombay Trooper',      website: 'https://www.bombaytrooper.com' },
  { handle: 'wyo.in',               name: 'Wear Your Opinion',   website: 'https://www.wyo.in' },

  // Ones found via Instagram search earlier
  { handle: 'clubak.in',            name: 'Club AK',             website: 'https://clubak.in' },
  { handle: 'labelmithra',          name: 'Mithra',              website: 'https://labelmithra.com' },
  { handle: 'sinthrone_official',   name: 'Sinthrone',           website: 'https://sinthrone.com' },
  { handle: 'ethnicbee.in',         name: 'Ethnic Bee',          website: 'https://ethnicbee.in' },
];

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const SKIP_EMAILS = ['example.com', 'sentry.io', 'wix.com', 'shopify.com', 'pixel', 'noreply', 'no-reply', 'postmaster', 'webmaster', 'privacy@', 'legal@', 'press@', 'investors@'];

function extractEmails(html) {
  const matches = html.match(EMAIL_RE) || [];
  return [...new Set(matches)].filter(e =>
    !SKIP_EMAILS.some(s => e.includes(s)) &&
    !e.endsWith('.png') && !e.endsWith('.jpg') &&
    e.includes('.')
  );
}

async function findEmail(website) {
  const pages = ['', '/contact', '/contact-us', '/pages/contact', '/pages/contact-us', '/about', '/pages/about'];
  for (const page of pages) {
    try {
      const url = website.replace(/\/$/, '') + page;
      const r = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) continue;
      const html = await r.text();
      const emails = extractEmails(html);
      // Prefer support/hello/info/contact emails
      const priority = emails.find(e => /^(support|hello|info|contact|hi|team|care|mail)\@/.test(e));
      if (priority) return priority;
      if (emails.length) return emails[0];
    } catch {}
  }
  return null;
}

async function run() {
  await connect();
  const existingSet = new Set((await Lead.find({}, 'handle').lean()).map(l => l.handle));
  console.log(`Existing leads: ${existingSet.size}\n`);

  let added = 0, updated = 0, skipped = 0;

  for (const brand of BRANDS) {
    process.stdout.write(`  ${brand.name} (${brand.website}) → `);

    const email = await findEmail(brand.website);
    if (!email) { console.log('no email found'); skipped++; continue; }
    console.log(email);

    const isNew = !existingSet.has(brand.handle);
    await Lead.findOneAndUpdate(
      { handle: brand.handle },
      {
        $set: {
          handle: brand.handle,
          name: brand.name,
          website: brand.website,
          email,
          sector: 'Clothing & Apparel',
          category: 'Clothing & Apparel',
          status: 'new',
          sequence_start_at: (() => {
            const d = new Date();
            d.setDate(d.getDate() + 1);
            d.setUTCHours(6, 30, 0, 0);
            return d;
          })(),
        }
      },
      { upsert: true }
    );

    existingSet.add(brand.handle);
    if (isNew) { added++; } else { updated++; }
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`\n✓ Done — ${added} new leads added, ${updated} updated with email, ${skipped} no email found`);
  console.log(`Total leads: ${await Lead.countDocuments()}`);
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
