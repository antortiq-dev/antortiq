const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const Lead = require('./models/Lead');
const Event = require('./models/Event');

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

async function sendDailyReport() {
  try {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setUTCHours(0, 0, 0, 0);

    // Email send stats from leads
    const leads = await Lead.find({ email: { $exists: true, $ne: '' } }).lean();
    const sentToday = leads.filter(l =>
      (l.proposal_sent_at    && new Date(l.proposal_sent_at)    >= todayStart) ||
      (l.followup_1_sent_at  && new Date(l.followup_1_sent_at)  >= todayStart) ||
      (l.followup_2_sent_at  && new Date(l.followup_2_sent_at)  >= todayStart) ||
      (l.followup_3_sent_at  && new Date(l.followup_3_sent_at)  >= todayStart)
    );
    const totalWithEmail = leads.length;
    const contacted = leads.filter(l => l.status === 'contacted').length;
    const pending = leads.filter(l => {
      const started = l.sequence_start_at && new Date(l.sequence_start_at) <= now;
      return started && !l.proposal_sent_at;
    }).length;

    // Sequence progress
    const day1Done = leads.filter(l => l.proposal_sent_at).length;
    const day2Done = leads.filter(l => l.followup_1_sent_at).length;
    const day3Done = leads.filter(l => l.followup_2_sent_at).length;
    const day4Done = leads.filter(l => l.followup_3_sent_at).length;

    // Engagement today
    const eventsToday = await Event.find({ createdAt: { $gte: todayStart } }).lean();
    const opensToday   = eventsToday.filter(e => e.type === 'email_open').length;
    const clicksToday  = eventsToday.filter(e => e.type === 'email_click').length;
    const visitsToday  = eventsToday.filter(e => e.type === 'page_visit').length;
    const waToday      = eventsToday.filter(e => e.type === 'wa_click').length;

    // Hot leads (clicked or visited today)
    const hotHandles = [...new Set(eventsToday
      .filter(e => e.type === 'email_click' || e.type === 'page_visit' || e.type === 'wa_click')
      .map(e => e.handle)
    )];
    const hotRows = hotHandles.length
      ? hotHandles.map(h => {
          const e = eventsToday.filter(ev => ev.handle === h);
          const clicks  = e.filter(ev => ev.type === 'email_click').length;
          const visits  = e.filter(ev => ev.type === 'page_visit').length;
          const wa      = e.filter(ev => ev.type === 'wa_click').length;
          return `<tr>
            <td style="padding:8px 12px;border-bottom:1px solid #1e1e1e;color:#fff;font-weight:600;">@${h}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #1e1e1e;color:#7eb8f7;text-align:center;">${clicks}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #1e1e1e;color:#1f9d62;text-align:center;">${visits}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #1e1e1e;color:#25d366;text-align:center;">${wa}</td>
          </tr>`;
        }).join('')
      : `<tr><td colspan="4" style="padding:12px;color:#555;text-align:center;">No hot leads today</td></tr>`;

    const stat = (val, label, color) =>
      `<div style="background:#111;border-radius:10px;padding:16px 20px;text-align:center;">
        <div style="font-size:28px;font-weight:900;color:${color};">${val}</div>
        <div style="font-size:11px;color:#666;margin-top:4px;text-transform:uppercase;letter-spacing:1px;">${label}</div>
      </div>`;

    const html = `
    <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:580px;margin:0 auto;background:#0c0c0c;border-radius:14px;overflow:hidden;color:#e9e9ea;">
      <div style="background:#111;padding:24px 28px;border-bottom:1px solid #1e1e1e;">
        <p style="margin:0 0 4px;font-size:10px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#e8344a;">Antortiq · Daily Report</p>
        <h1 style="margin:6px 0 0;font-size:22px;color:#fff;">End-of-Day Summary</h1>
        <p style="margin:4px 0 0;font-size:12px;color:#555;">${now.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday:'long', day:'numeric', month:'long' })}</p>
      </div>

      <div style="padding:24px 28px;">
        <p style="margin:0 0 12px;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#555;">Email Sequence</p>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;margin-bottom:24px;">
          ${stat(sentToday.length, 'Sent Today', '#e8344a')}
          ${stat(day1Done, 'Day 1 Done', '#7eb8f7')}
          ${stat(day2Done, 'Day 2 Done', '#7eb8f7')}
          ${stat(pending, 'Still Pending', '#555')}
        </div>

        <p style="margin:0 0 12px;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#555;">Today's Engagement</p>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;margin-bottom:24px;">
          ${stat(opensToday,  'Opens',     '#f0c040')}
          ${stat(clicksToday, 'Clicks',    '#7eb8f7')}
          ${stat(visitsToday, 'Visits',    '#1f9d62')}
          ${stat(waToday,     'WA Taps',   '#25d366')}
        </div>

        <p style="margin:0 0 12px;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#555;">Hot Leads Today</p>
        <table style="width:100%;border-collapse:collapse;background:#111;border-radius:10px;overflow:hidden;margin-bottom:24px;">
          <thead>
            <tr style="background:#1a1a1a;">
              <th style="padding:10px 12px;text-align:left;font-size:11px;color:#555;letter-spacing:1px;">BRAND</th>
              <th style="padding:10px 12px;text-align:center;font-size:11px;color:#555;letter-spacing:1px;">CLICKS</th>
              <th style="padding:10px 12px;text-align:center;font-size:11px;color:#555;letter-spacing:1px;">VISITS</th>
              <th style="padding:10px 12px;text-align:center;font-size:11px;color:#555;letter-spacing:1px;">WA TAPS</th>
            </tr>
          </thead>
          <tbody>${hotRows}</tbody>
        </table>

        <p style="margin:0 0 12px;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#555;">Overall Pipeline</p>
        <div style="background:#111;border-radius:10px;padding:16px 20px;margin-bottom:24px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
            <span style="color:#777;font-size:13px;">Total leads with email</span>
            <span style="color:#fff;font-weight:700;">${totalWithEmail}</span>
          </div>
          <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
            <span style="color:#777;font-size:13px;">Contacted (Day 1+ sent)</span>
            <span style="color:#7eb8f7;font-weight:700;">${contacted}</span>
          </div>
          <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
            <span style="color:#777;font-size:13px;">Day 3 done</span>
            <span style="color:#7eb8f7;font-weight:700;">${day3Done}</span>
          </div>
          <div style="display:flex;justify-content:space-between;">
            <span style="color:#777;font-size:13px;">Day 4 done (full sequence)</span>
            <span style="color:#1f9d62;font-weight:700;">${day4Done}</span>
          </div>
        </div>

        <a href="https://antortiq.onrender.com/admin.html" style="display:block;background:#e8344a;color:#fff;font-weight:800;font-size:14px;padding:14px 24px;border-radius:99px;text-decoration:none;text-align:center;">Open Admin Dashboard →</a>
      </div>
    </div>`;

    const transporter = getTransporter();
    await transporter.sendMail({
      from: `"Antortiq" <${process.env.SMTP_USER}>`,
      to: 'harshitvj24@gmail.com',
      subject: `Antortiq Daily Report — ${sentToday.length} sent, ${opensToday} opens, ${clicksToday} clicks`,
      html,
    });
    console.log('[scheduler] Daily report sent');
  } catch (e) {
    console.error('[scheduler] Daily report error:', e.message);
  }
}

// Primary: every day at 12:00 PM IST
cron.schedule('0 12 * * *', runDailyFollowups, { timezone: 'Asia/Kolkata' });

// Daily report at 4:00 PM IST
cron.schedule('0 16 * * *', sendDailyReport, { timezone: 'Asia/Kolkata' });

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

module.exports = { runDailyFollowups, sendDailyReport };
