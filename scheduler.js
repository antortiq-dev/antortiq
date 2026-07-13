const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const Lead = require('./models/Lead');

function getTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

const FOLLOWUP_SUBJECTS = {
  1: (brand) => `${brand} — quick follow-up (day 2)`,
  2: (brand) => `${brand} — do you know these numbers about your own brand?`,
  3: (brand) => `${brand} — last one. here's what your emails should look like.`,
};

// Only retry transient errors — skip immediately if it's a daily limit / auth / policy error
// so we don't block the event loop for 30+ minutes on an unrecoverable failure
const FATAL_PATTERNS = [
  'Daily user sending limit exceeded',
  '550-5.4.5',
  '550 5.4.5',
  'limit exceeded',
  'auth',
  'invalid credentials',
  'username and password',
];
function isFatalError(msg) {
  const m = msg.toLowerCase();
  return FATAL_PATTERNS.some(p => m.includes(p.toLowerCase()));
}

async function trySend(transporter, mailOptions) {
  // Single attempt — no blocking retries. Transient network errors are handled
  // by the cron running again tomorrow (idempotent). Daily-limit errors are fatal
  // for that day regardless of retries.
  await transporter.sendMail(mailOptions);
}

const PROPOSAL_SUBJECTS = b => `${b} × Antortiq — We built something for you`;

async function runDailyFollowups() {
  console.log(`[scheduler] Running at ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
  const now = new Date();
  const leads = await Lead.find({ email: { $exists: true, $ne: '' } }).lean();
  const transporter = getTransporter();
  const trackBase = 'https://antortiq.onrender.com/api/track';

  let sent = 0, skipped = 0, failed = 0, limitHit = false;

  for (const lead of leads) {
    const started = lead.sequence_start_at && new Date(lead.sequence_start_at) <= now;

    let day = null;
    if (started && !lead.proposal_sent_at)                                    day = 0;
    else if (lead.proposal_sent_at && !lead.followup_1_sent_at)               day = 1;
    else if (lead.followup_1_sent_at && !lead.followup_2_sent_at)             day = 2;
    else if (lead.followup_2_sent_at && !lead.followup_3_sent_at)             day = 3;

    if (day === null) { skipped++; continue; }

    // If we already hit the daily SMTP limit this run, skip remaining to avoid spam errors
    if (limitHit) { skipped++; continue; }

    const brandName = lead.name || lead.handle;
    const brandDomain = lead.website
      ? lead.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, '').split('.')[0]
      : lead.handle;
    const brandNameEncoded = encodeURIComponent(brandName);
    const proposalLink = `https://antortiq.onrender.com/d2c-proposal.html?brand=${brandNameEncoded}`;
    const templateId   = day === 0 ? 'proposal' : `followup-${day}`;
    const clickTracked = `${trackBase}/click/${brandNameEncoded}/${templateId}?to=${encodeURIComponent(proposalLink)}`;
    const openPixel    = `${trackBase}/open/${brandNameEncoded}/${templateId}`;
    const subject      = day === 0 ? PROPOSAL_SUBJECTS(brandName) : FOLLOWUP_SUBJECTS[day](brandName);

    const templateFileName = day === 0 ? 'd2c-email.html' : `d2c-followup-${day}.html`;
    const raw = fs.readFileSync(path.join(__dirname, 'proposals', templateFileName), 'utf8');
    const html = raw
      .replace(/\{\{BRAND_NAME\}\}/g, brandName)
      .replace(/\{\{BRAND_NAME_UPPER\}\}/g, brandName.toUpperCase())
      .replace(/\{\{BRAND_DOMAIN\}\}/g, brandDomain)
      .replace(/\{\{BRAND_NAME_ENCODED\}\}/g, brandNameEncoded)
      .replace(/\{\{PROPOSAL_LINK\}\}/g, clickTracked)
      .replace(/\{\{OPEN_PIXEL\}\}/g, openPixel);

    try {
      await trySend(transporter, {
        from: `"Antortiq" <${process.env.SMTP_USER}>`,
        to: lead.email,
        subject,
        html,
      });

      // Use findOneAndUpdate to avoid VersionError from concurrent saves
      const update = day === 0
        ? { proposal_sent_at: new Date(), status: 'contacted' }
        : { [`followup_${day}_sent_at`]: new Date() };
      await Lead.findOneAndUpdate({ _id: lead._id }, { $set: update });

      sent++;
      console.log(`[scheduler] ✓ Day ${day + 1} → ${brandName} <${lead.email}>`);
    } catch (err) {
      console.error(`[scheduler] ✗ Day ${day + 1} → ${brandName}: ${err.message}`);
      if (isFatalError(err.message)) {
        console.log('[scheduler] Daily limit or auth error — stopping for today, will resume tomorrow');
        limitHit = true;
      }
      failed++;
    }

    await new Promise(r => setTimeout(r, 15000));
  }

  console.log(`[scheduler] Done — sent ${sent}, failed ${failed}, skipped ${skipped}`);
}

// Primary: every day at 12:00 PM IST
cron.schedule('0 12 * * *', runDailyFollowups, { timezone: 'Asia/Kolkata' });

// Backup: 12:05 PM IST in case :00 tick was missed
cron.schedule('5 12 * * *', runDailyFollowups, { timezone: 'Asia/Kolkata' });

// Keepalive ping every 10 min so Render doesn't spin down
if (process.env.RENDER_EXTERNAL_URL) {
  cron.schedule('*/10 * * * *', () => {
    fetch(`${process.env.RENDER_EXTERNAL_URL}/healthz`).catch(() => {});
  });
  console.log('[scheduler] Keepalive ping every 10 min →', process.env.RENDER_EXTERNAL_URL);
}

console.log('[scheduler] Follow-up cron loaded — fires daily at 12:00 PM IST');

module.exports = { runDailyFollowups };
