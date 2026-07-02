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

// Retry delays: 2 min, 10 min, 30 min
const RETRY_DELAYS = [2 * 60 * 1000, 10 * 60 * 1000, 30 * 60 * 1000];

async function sendWithRetry(transporter, mailOptions, brandName, day) {
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      await transporter.sendMail(mailOptions);
      return true;
    } catch (err) {
      if (attempt < RETRY_DELAYS.length) {
        const wait = RETRY_DELAYS[attempt];
        console.log(`[scheduler] ✗ Day ${day+1} → ${brandName}: ${err.message} — retrying in ${wait/60000} min`);
        await new Promise(r => setTimeout(r, wait));
      } else {
        console.error(`[scheduler] ✗ Day ${day+1} → ${brandName}: gave up after ${RETRY_DELAYS.length} retries — ${err.message}`);
        return false;
      }
    }
  }
}

async function runDailyFollowups() {
  console.log(`[scheduler] Running follow-up sequence at ${new Date().toISOString()}`);
  const leads = readLeads();
  const transporter = getTransporter();
  const trackBase = 'https://antortiq.onrender.com/api/track';

  let sent = 0, skipped = 0, failed = 0;

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

    const raw = fs.readFileSync(path.join(__dirname, 'proposals', `d2c-followup-${day}.html`), 'utf8');
    const html = raw
      .replace(/\{\{BRAND_NAME\}\}/g, brandName)
      .replace(/\{\{BRAND_NAME_UPPER\}\}/g, brandName.toUpperCase())
      .replace(/\{\{BRAND_DOMAIN\}\}/g, brandDomain)
      .replace(/\{\{BRAND_NAME_ENCODED\}\}/g, brandNameEncoded)
      .replace(/\{\{PROPOSAL_LINK\}\}/g, clickTracked)
      .replace(/\{\{OPEN_PIXEL\}\}/g, openPixel);

    const ok = await sendWithRetry(transporter, {
      from: `"Antortiq" <${process.env.SMTP_USER}>`,
      to: lead.email,
      subject: FOLLOWUP_SUBJECTS[day](brandName),
      html,
    }, brandName, day);

    if (ok) {
      lead[`followup_${day}_sent_at`] = new Date().toISOString();
      // Write after each success so a crash mid-run doesn't lose progress
      writeLeads(leads);
      sent++;
      console.log(`[scheduler] ✓ Day ${day+1} → ${brandName} <${lead.email}>`);
    } else {
      failed++;
    }

    // Gap between each lead to avoid bursting the SMTP limit
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`[scheduler] Done — sent ${sent}, failed ${failed}, skipped ${skipped}`);
}

// Every day at 12:00 PM server time
cron.schedule('0 12 * * *', runDailyFollowups, { timezone: 'Asia/Kolkata' });

console.log('[scheduler] Follow-up cron loaded — fires daily at 12:00 PM IST');

module.exports = { runDailyFollowups };
