const express = require('express');
const nodemailer = require('nodemailer');
const Event = require('../models/Event');

const router = express.Router();

const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

const TEMPLATE_LABELS = {
  proposal: 'Day 1 — Main Proposal',
  'followup-1': 'Day 2 — WhatsApp Chaos',
  'followup-2': 'Day 3 — Flying Blind',
  'followup-3': 'Day 4 — Boring Emails',
};

async function logEvent(type, handle, meta = {}) {
  try {
    await Event.create({ type, handle, ...meta });
  } catch (e) {
    console.error('[track] logEvent error:', e.message);
  }
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
    console.error('[track] notify error:', e.message);
  }
}

router.get('/open/:handle/:template', async (req, res) => {
  const handle = decodeURIComponent(req.params.handle);
  await logEvent('email_open', handle, { template: req.params.template });
  res.set('Content-Type', 'image/gif');
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.send(PIXEL);
});

router.get('/click/:handle/:template', async (req, res) => {
  const handle = decodeURIComponent(req.params.handle);
  const { template } = req.params;
  const to = req.query.to || 'https://antortiq.onrender.com';
  await logEvent('email_click', handle, { template, to });
  const label = TEMPLATE_LABELS[template] || template;
  notifyHarshit(
    `🔥 ${handle} clicked your email`,
    `<strong style="color:#fff;">${handle}</strong> clicked a link in your <strong style="color:#fff;">${label}</strong> email.<br><br>Time: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}<br>This is a strong buying signal — follow up now!`
  );
  res.redirect(302, to);
});

router.post('/visit', async (req, res) => {
  const { brand, page, ref } = req.body || {};
  if (!brand) return res.status(400).json({ error: 'brand required' });
  await logEvent('page_visit', brand, { page: page || 'd2c-proposal', ref });
  notifyHarshit(
    `👀 ${brand} is viewing your proposal`,
    `<strong style="color:#fff;">${brand}</strong> just opened the proposal page.<br><br>Time: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}${ref ? `<br>Source: ${ref}` : ''}<br><br>Strike while it's hot!`
  );
  res.json({ ok: true });
});

router.post('/wa-click', async (req, res) => {
  const { brand, template } = req.body || {};
  if (!brand) return res.status(400).json({ error: 'brand required' });
  await logEvent('wa_click', brand, { template: template || 'proposal' });
  const label = TEMPLATE_LABELS[template] || template || 'proposal page';
  notifyHarshit(
    `💬 ${brand} is about to WhatsApp you!`,
    `<strong style="color:#fff;">${brand}</strong> just tapped the WhatsApp button in your <strong style="color:#fff;">${label}</strong>.<br><br>Time: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}<br><br>They're opening WhatsApp right now — keep an eye on your phone!`
  );
  res.json({ ok: true });
});

router.get('/events', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 200, 1000);
  const events = await Event.find().sort({ createdAt: -1 }).limit(limit).lean();
  // Normalise shape for admin dashboard (ts field)
  res.json(events.map(e => ({ ...e, ts: e.createdAt })));
});

router.get('/stats', async (req, res) => {
  const events = await Event.find().sort({ createdAt: -1 }).lean();
  const byLead = {};

  events.forEach(e => {
    const key = e.handle || e.brand || 'unknown';
    if (!byLead[key]) byLead[key] = { handle: key, opens: 0, clicks: 0, visits: 0, wa_clicks: 0, last_seen: null, templates_opened: new Set(), templates_clicked: new Set() };
    const l = byLead[key];
    if (e.type === 'email_open')  { l.opens++;     if (e.template) l.templates_opened.add(e.template); }
    if (e.type === 'email_click') { l.clicks++;    if (e.template) l.templates_clicked.add(e.template); }
    if (e.type === 'page_visit')  l.visits++;
    if (e.type === 'wa_click')    l.wa_clicks++;
    const ts = e.createdAt?.toISOString?.() || e.ts;
    if (!l.last_seen || ts > l.last_seen) l.last_seen = ts;
  });

  const leads = Object.values(byLead).map(l => ({
    ...l,
    templates_opened:  [...l.templates_opened],
    templates_clicked: [...l.templates_clicked],
    score: l.clicks * 5 + l.visits * 4 + l.wa_clicks * 8 + l.opens,
  })).sort((a, b) => b.score - a.score);

  const templateStats = {};
  events.filter(e => e.template).forEach(e => {
    if (!templateStats[e.template]) templateStats[e.template] = { label: TEMPLATE_LABELS[e.template] || e.template, clicks: 0, opens: 0 };
    if (e.type === 'email_click') templateStats[e.template].clicks++;
    if (e.type === 'email_open')  templateStats[e.template].opens++;
  });

  res.json({
    leads,
    templates: Object.entries(templateStats).map(([k, v]) => ({ id: k, ...v })).sort((a, b) => b.clicks - a.clicks),
    total_events: events.length,
  });
});

module.exports = router;
