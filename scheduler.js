const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const LEADS_FILE = path.join(__dirname, 'data', 'leads.json');

function readLeads() {
  return JSON.parse(fs.readFileSync(LEADS_FILE, 'utf8'));
}
function writeLeads(leads) {
  fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2));
}

function getTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

const FOLLOWUP_SUBJECTS = {
  1: (brand) => `${brand} — quick follow-up (day 2)`,
  2: (brand) => `${brand} — do you know these numbers about your own brand?`,
  3: (brand) => `${brand} — last one. here's what your emails should look like.`,
};

async function runDailyFollowups() {
  console.log(`[scheduler] Running follow-up sequence at ${new Date().toISOString()}`);
  const leads = readLeads();
  const transporter = getTransporter();
  const trackBase = 'https://antortiq.onrender.com/api/track';

  let sent = 0, skipped = 0;

  for (const lead of leads) {
    if (!lead.email) { skipped++; continue; }

    // Determine which day to send next
    let day = null;
    if (lead.proposal_sent_at && !lead.followup_1_sent_at) day = 1;
    else if (lead.followup_1_sent_at && !lead.followup_2_sent_at) day = 2;
    else if (lead.followup_2_sent_at && !lead.followup_3_sent_at) day = 3;

    if (!day) { skipped++; continue; }

    const brandName = lead.name || lead.handle;
    const brandDomain = lead.website
      ? lead.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, '').split('.')[0]
      : lead.handle;
    const brandNameEncoded = encodeURIComponent(brandName);
    const proposalLink = `https://antortiq.onrender.com/d2c-proposal.html?brand=${brandNameEncoded}`;
    const templateId = `followup-${day}`;
    const clickTracked = `${trackBase}/click/${brandNameEncoded}/${templateId}?to=${encodeURIComponent(proposalLink)}`;
    const openPixel = `${trackBase}/open/${brandNameEncoded}/${templateId}`;

    try {
      const raw = fs.readFileSync(path.join(__dirname, 'proposals', `d2c-followup-${day}.html`), 'utf8');
      const html = raw
        .replace(/\{\{BRAND_NAME\}\}/g, brandName)
        .replace(/\{\{BRAND_NAME_UPPER\}\}/g, brandName.toUpperCase())
        .replace(/\{\{BRAND_DOMAIN\}\}/g, brandDomain)
        .replace(/\{\{BRAND_NAME_ENCODED\}\}/g, brandNameEncoded)
        .replace(/\{\{PROPOSAL_LINK\}\}/g, clickTracked)
        .replace(/\{\{OPEN_PIXEL\}\}/g, openPixel);

      await transporter.sendMail({
        from: `"Antortiq" <${process.env.SMTP_USER}>`,
        to: lead.email,
        subject: FOLLOWUP_SUBJECTS[day](brandName),
        html,
      });

      lead[`followup_${day}_sent_at`] = new Date().toISOString();
      sent++;
      console.log(`[scheduler] ✓ Day ${day+1} → ${brandName} <${lead.email}>`);

      // Avoid SMTP rate limiting
      await new Promise(r => setTimeout(r, 300));
    } catch (err) {
      console.error(`[scheduler] ✗ Day ${day+1} → ${brandName}: ${err.message}`);
    }
  }

  writeLeads(leads);
  console.log(`[scheduler] Done — sent ${sent}, skipped ${skipped}`);
}

// Every day at 12:00 PM server time
cron.schedule('0 12 * * *', runDailyFollowups, { timezone: 'Asia/Kolkata' });

console.log('[scheduler] Follow-up cron loaded — fires daily at 12:00 PM IST');

module.exports = { runDailyFollowups };
