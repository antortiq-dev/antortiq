const express = require('express');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const router = express.Router();
const EVENTS_FILE = path.join(__dirname, '..', 'data', 'events.json');

// 1×1 transparent GIF
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

const TEMPLATE_LABELS = {
  proposal: 'Day 1 — Main Proposal',
  'followup-1': 'Day 2 — WhatsApp Chaos',
  'followup-2': 'Day 3 — Flying Blind',
  'followup-3': 'Day 4 — Boring Emails',
};

function readEvents() {
  if (!fs.existsSync(EVENTS_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(EVENTS_FILE, 'utf8')); } catch { return []; }
}

function logEvent(type, handle, meta = {}) {
  const events = readEvents();
  const event = { type, handle, ts: new Date().toISOString(), ...meta };
  events.unshift(event);
  fs.writeFileSync(EVENTS_FILE, JSON.stringify(events.slice(0, 5000), null, 2));
  return event;
}

function mailer() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

async function notifyHarshit(subject, body) {
  try {
    await mailer().sendMail({
      from: `"Antortiq Tracker" <${process.env.SMTP_USER}>`,
      to: 'harshitvj24@gmail.com',
      subject,
      html: `<div style="font-family:Arial,sans-serif;max-width:480px;padding:24px;background:#0c0c0c;border-radius:12px;color:#e9e9ea;">
        <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#e8344a;">Antortiq · Lead Activity</p>
        <h2 style="margin:8px 0 16px;font-size:20px;color:#fff;">${subject}</h2>
        <p style="margin:0 0 20px;font-size:14px;color:#9a9ba1;line-height:1.7;">${body}</p>
        <a href="https://antortiq.onrender.com/admin.html" style="display:inline-block;background:#e8344a;color:#fff;font-weight:800;font-size:13px;padding:12px 24px;border-radius:99px;text-decoration:none;">Open Admin Dashboard →</a>
        <p style="margin:16px 0 0;font-size:11px;color:#555;">Antortiq Internal Tracker</p>
      </div>`,
    });
  } catch (e) {
    console.error('Notify error:', e.message);
  }
}

// GET /api/track/open/:handle/:template — email open pixel
router.get('/open/:handle/:template', (req, res) => {
  const handle = decodeURIComponent(req.params.handle);
  const { template } = req.params;
  logEvent('email_open', handle, { template });
  res.set('Content-Type', 'image/gif');
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.send(PIXEL);
});

// GET /api/track/click/:handle/:template?to=URL — email link click + redirect
router.get('/click/:handle/:template', async (req, res) => {
  const handle = decodeURIComponent(req.params.handle);
  const { template } = req.params;
  const to = req.query.to || 'https://antortiq.onrender.com';
  logEvent('email_click', handle, { template, url: to });
  const label = TEMPLATE_LABELS[template] || template;
  notifyHarshit(
    `🔥 ${handle} clicked your email`,
    `<strong style="color:#fff;">${handle}</strong> clicked a link in your <strong style="color:#fff;">${label}</strong> email.<br><br>Time: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}<br>This is a strong buying signal — follow up now!`
  );
  res.redirect(302, to);
});

// POST /api/track/visit — proposal page visit beacon
router.post('/visit', async (req, res) => {
  const { brand, page, ref } = req.body || {};
  if (!brand) return res.status(400).json({ error: 'brand required' });
  logEvent('page_visit', brand, { page: page || 'd2c-proposal', ref });
  notifyHarshit(
    `👀 ${brand} is viewing your proposal`,
    `<strong style="color:#fff;">${brand}</strong> just opened the proposal page.<br><br>Time: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}${ref ? `<br>Source: ${ref}` : ''}<br><br>Strike while it's hot!`
  );
  res.json({ ok: true });
});

// POST /api/track/wa-click — WhatsApp button click
router.post('/wa-click', async (req, res) => {
  const { brand, template } = req.body || {};
  if (!brand) return res.status(400).json({ error: 'brand required' });
  logEvent('wa_click', brand, { template: template || 'proposal' });
  const label = TEMPLATE_LABELS[template] || template || 'proposal page';
  notifyHarshit(
    `💬 ${brand} is about to WhatsApp you!`,
    `<strong style="color:#fff;">${brand}</strong> just tapped the WhatsApp button in your <strong style="color:#fff;">${label}</strong>.<br><br>Time: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}<br><br>They're opening WhatsApp right now — keep an eye on your phone!`
  );
  res.json({ ok: true });
});

// GET /api/track/events — raw event feed for admin dashboard
router.get('/events', (req, res) => {
  const limit = Number(req.query.limit) || 200;
  res.json(readEvents().slice(0, limit));
});

// GET /api/track/stats — aggregated stats for admin dashboard
router.get('/stats', (req, res) => {
  const events = readEvents();
  const byLead = {};

  events.forEach(e => {
    if (!byLead[e.handle]) byLead[e.handle] = { handle: e.handle, opens: 0, clicks: 0, visits: 0, wa_clicks: 0, last_seen: null, templates_opened: new Set(), templates_clicked: new Set() };
    const l = byLead[e.handle];
    if (e.type === 'email_open') { l.opens++; if (e.template) l.templates_opened.add(e.template); }
    if (e.type === 'email_click') { l.clicks++; if (e.template) l.templates_clicked.add(e.template); }
    if (e.type === 'page_visit') l.visits++;
    if (e.type === 'wa_click') l.wa_clicks++;
    if (!l.last_seen || e.ts > l.last_seen) l.last_seen = e.ts;
  });

  // Convert Sets to arrays for JSON
  const leads = Object.values(byLead).map(l => ({
    ...l,
    templates_opened: [...l.templates_opened],
    templates_clicked: [...l.templates_clicked],
    score: l.clicks * 5 + l.visits * 4 + l.wa_clicks * 8 + l.opens * 1,
  })).sort((a, b) => b.score - a.score);

  // Template performance
  const templateStats = {};
  events.filter(e => e.type === 'email_click' && e.template).forEach(e => {
    if (!templateStats[e.template]) templateStats[e.template] = { label: TEMPLATE_LABELS[e.template] || e.template, clicks: 0, opens: 0 };
    templateStats[e.template].clicks++;
  });
  events.filter(e => e.type === 'email_open' && e.template).forEach(e => {
    if (!templateStats[e.template]) templateStats[e.template] = { label: TEMPLATE_LABELS[e.template] || e.template, clicks: 0, opens: 0 };
    templateStats[e.template].opens++;
  });

  res.json({ leads, templates: Object.entries(templateStats).map(([k, v]) => ({ id: k, ...v })).sort((a, b) => b.clicks - a.clicks), total_events: events.length });
});

module.exports = router;
