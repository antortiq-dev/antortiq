/**
 * Lead discovery pipeline.
 *
 * Pulls Instagram profile data for a seed list of D2C brand handles via
 * Apify's Instagram Profile Scraper, then expands the list using each
 * profile's "related accounts" data point returned by the same actor.
 * Candidates with 10k-50k followers and a bio website link get the
 * website crawled for a contact email/phone, then everything is written
 * to data/leads.json for the /leads.html dashboard to read.
 *
 * Requires APIFY_API_TOKEN in .env. Costs apply per Apify actor run --
 * this is NOT free, it's pay-as-you-go against your Apify account.
 *
 * Usage: node scripts/discover-leads.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const APIFY_TOKEN = process.env.APIFY_API_TOKEN;
const LEADS_FILE = path.join(__dirname, '..', 'data', 'leads.json');
const PROFILE_ACTOR = 'apify~instagram-profile-scraper';

const MIN_FOLLOWERS = 10000;
const MAX_FOLLOWERS = 50000;

// Starter seed set: verified-live Indian D2C brand handles across a few
// sectors, used purely as lookalike-crawl entry points (their own follower
// count doesn't need to be in the target range -- only what they lead to).
// Swap/extend this list any time.
const SEED_HANDLES = [
  'plumgoodness',          // beauty
  'thewholetruthfoods',    // food
  'mamaearth.in',          // beauty/parenting
  'bummer.in',             // innerwear/apparel
  'sleepyowlcoffee',       // coffee/F&B
  'crepdogcrew',           // sneakers/streetwear
  'superkicksindia',       // sneakers/streetwear
  'vegnonveg',             // sneakers/streetwear/lifestyle
  'freesociety.in',        // streetwear
  'mainstreetmarketplace', // streetwear/sneaker reselling
];

async function apifyRunSync(actorId, input) {
  const url = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${APIFY_TOKEN}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(`Apify actor ${actorId} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function fetchProfiles(usernames) {
  return apifyRunSync(PROFILE_ACTOR, { usernames });
}

function isPlausibleEmail(email) {
  if (/\.(png|jpe?g|gif|svg|webp|css|js)$/i.test(email)) return false; // asset filenames, not emails
  const domain = (email.split('@')[1] || '').toLowerCase();
  if (domain === 'example.com' || domain === 'email.com' || domain === 'domain.com') return false; // placeholders
  if (/^\d/.test(domain)) return false; // e.g. retina "@2x.png" fragments
  return true;
}

function extractEmailFromHtml(html) {
  // Prefer mailto: links -- the most reliable signal -- before falling back
  // to a loose body-text scan (which is prone to matching asset filenames).
  const mailtoMatches = [...html.matchAll(/mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g)];
  for (const m of mailtoMatches) {
    if (isPlausibleEmail(m[1])) return m[1];
  }
  const matches = html.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
  for (const email of matches) {
    if (isPlausibleEmail(email)) return email;
  }
  return null;
}

function extractPhoneFromHtml(html) {
  const match = html.match(/(\+?91[\s-]?)?[6-9]\d{9}/);
  return match ? match[0].replace(/[\s-]/g, '') : null;
}

async function enrichWebsite(url) {
  try {
    const res = await fetch(url, { redirect: 'follow' });
    const html = await res.text();
    return { email: extractEmailFromHtml(html), phone: extractPhoneFromHtml(html) };
  } catch {
    return { email: null, phone: null };
  }
}

function loadLeads() {
  if (!fs.existsSync(LEADS_FILE)) return [];
  return JSON.parse(fs.readFileSync(LEADS_FILE, 'utf8'));
}

function saveLeads(leads) {
  fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2));
}

async function main() {
  if (!APIFY_TOKEN) {
    console.error('Missing APIFY_API_TOKEN in .env. Get one at console.apify.com/account/integrations');
    process.exit(1);
  }

  console.log(`Fetching profile data for ${SEED_HANDLES.length} seed handles...`);
  const profiles = await fetchProfiles(SEED_HANDLES);

  // Expand candidate pool using each profile's related/suggested accounts,
  // if the actor's response includes them.
  const candidateUsernames = new Set();
  for (const p of profiles) {
    (p.relatedProfiles || []).forEach((r) => candidateUsernames.add(r.username));
  }

  console.log(`Found ${candidateUsernames.size} related accounts, fetching their profiles...`);
  const candidateProfiles = candidateUsernames.size
    ? await fetchProfiles([...candidateUsernames])
    : [];

  const allProfiles = [...profiles, ...candidateProfiles];
  const leads = loadLeads();
  const existingHandles = new Set(leads.map((l) => l.handle));

  let added = 0;
  for (const p of allProfiles) {
    const followers = p.followersCount || 0;
    if (followers < MIN_FOLLOWERS || followers > MAX_FOLLOWERS) continue;
    if (existingHandles.has(p.username)) continue;

    const website = (p.externalUrls && p.externalUrls[0] && p.externalUrls[0].url) || null;
    let contact = { email: null, phone: null };
    if (website) {
      console.log(`Crawling ${website} for contact info...`);
      contact = await enrichWebsite(website);
    }

    leads.push({
      handle: p.username,
      name: p.fullName || p.username,
      sector: p.businessCategoryName || 'Unknown',
      followers,
      instagram: `https://instagram.com/${p.username}`,
      avatar: p.profilePicUrlHD || p.profilePicUrl || null,
      website,
      email: contact.email,
      phone: contact.phone,
      status: 'new',
      discovered_at: new Date().toISOString(),
    });
    existingHandles.add(p.username);
    added++;
  }

  saveLeads(leads);
  console.log(`Done. Added ${added} new leads. Total leads: ${leads.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
