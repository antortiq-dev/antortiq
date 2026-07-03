const express = require('express');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const Lead = require('../models/Lead');

const router = express.Router();

function getTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

function buildEmail(templateFile, lead, templateId) {
  const trackBase = 'https://antortiq.onrender.com/api/track';
  const brandName = lead.name || lead.handle;
  const brandDomain = lead.website
    ? lead.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, '').split('.')[0]
    : lead.handle;
  const brandNameEncoded = encodeURIComponent(brandName);
  const proposalLink = `https://antortiq.onrender.com/d2c-proposal.html?brand=${brandNameEncoded}`;
  const clickTracked = `${trackBase}/click/${brandNameEncoded}/${templateId}?to=${encodeURIComponent(proposalLink)}`;
  const openPixel = `${trackBase}/open/${brandNameEncoded}/${templateId}`;

  const raw = fs.readFileSync(templateFile, 'utf8');
  const html = raw
    .replace(/\{\{BRAND_NAME\}\}/g, brandName)
    .replace(/\{\{BRAND_NAME_UPPER\}\}/g, brandName.toUpperCase())
    .replace(/\{\{BRAND_DOMAIN\}\}/g, brandDomain)
    .replace(/\{\{BRAND_NAME_ENCODED\}\}/g, brandNameEncoded)
    .replace(/\{\{PROPOSAL_LINK\}\}/g, clickTracked)
    .replace(/\{\{OPEN_PIXEL\}\}/g, openPixel);

  return { html, brandName, proposalLink };
}

router.get('/', async (req, res) => {
  const leads = await Lead.find().sort({ createdAt: 1 }).lean();
  res.json(leads);
});

// Avatar proxy — fetches any HTTPS image so browser CORS/CORP headers don't block it
router.get('/avatar', async (req, res) => {
  const { url } = req.query;
  if (!url || !url.startsWith('https://')) {
    return res.status(400).send('Invalid avatar URL');
  }
  try {
    const upstream = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'Referer': 'https://www.instagram.com/',
      },
    });
    if (!upstream.ok) return res.status(upstream.status).send('Upstream error');
    res.set('Content-Type', upstream.headers.get('content-type') || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(Buffer.from(await upstream.arrayBuffer()));
  } catch {
    res.status(502).send('Failed to fetch avatar');
  }
});

// GET /api/leads/categories
router.get('/categories', async (req, res) => {
  const leads = await Lead.find().lean();
  const cats = {};
  leads.forEach(l => {
    const c = l.category || 'Uncategorized';
    if (!cats[c]) cats[c] = { category: c, total: 0, with_email: 0 };
    cats[c].total++;
    if (l.email) cats[c].with_email++;
  });
  res.json(Object.values(cats).sort((a, b) => b.total - a.total));
});

// POST /api/leads/:handle/send-proposal
router.post('/:handle/send-proposal', async (req, res) => {
  const lead = await Lead.findOne({ handle: req.params.handle });
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  const toEmail = req.body.email || lead.email;
  if (!toEmail) return res.status(400).json({ error: 'No email address for this lead' });

  const templateFile = path.join(__dirname, '..', 'proposals', 'd2c-email.html');
  const { html, brandName, proposalLink } = buildEmail(templateFile, lead, 'proposal');

  try {
    await getTransporter().sendMail({
      from: `"Antortiq" <${process.env.SMTP_USER}>`,
      to: toEmail,
      subject: `${brandName} × Antortiq — We built something for you`,
      html,
    });
    lead.status = 'contacted';
    lead.proposal_sent_at = new Date();
    await lead.save();
    res.json({ ok: true, sent_to: toEmail, proposal_link: proposalLink });
  } catch (err) {
    res.status(500).json({ error: 'Failed to send email', detail: err.message });
  }
});

const FOLLOWUP_SUBJECTS = {
  1: b => `${b} — quick follow-up (day 2)`,
  2: b => `${b} — do you know these numbers about your own brand?`,
  3: b => `${b} — last one. here's what your emails should look like.`,
};

// POST /api/leads/:handle/send-followup/:day
router.post('/:handle/send-followup/:day', async (req, res) => {
  const day = Number(req.params.day);
  if (![1, 2, 3].includes(day)) return res.status(400).json({ error: 'day must be 1, 2, or 3' });

  const lead = await Lead.findOne({ handle: req.params.handle });
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  const toEmail = req.body.email || lead.email;
  if (!toEmail) return res.status(400).json({ error: 'No email address for this lead' });

  const templateId = `followup-${day}`;
  const templateFile = path.join(__dirname, '..', 'proposals', `d2c-followup-${day}.html`);
  const { html, brandName, proposalLink } = buildEmail(templateFile, lead, templateId);

  try {
    await getTransporter().sendMail({
      from: `"Antortiq" <${process.env.SMTP_USER}>`,
      to: toEmail,
      subject: FOLLOWUP_SUBJECTS[day](brandName),
      html,
    });
    lead[`followup_${day}_sent_at`] = new Date();
    await lead.save();
    res.json({ ok: true, sent_to: toEmail, day, proposal_link: proposalLink });
  } catch (err) {
    res.status(500).json({ error: 'Failed to send email', detail: err.message });
  }
});

// POST /api/leads/bulk-send
router.post('/bulk-send', async (req, res) => {
  const { category, template, skip_contacted } = req.body || {};
  if (!category) return res.status(400).json({ error: 'category required' });
  if (!template) return res.status(400).json({ error: 'template required' });

  const query = { email: { $exists: true, $ne: '' } };
  if (category !== 'all') query.category = category;
  if (skip_contacted) query.status = { $ne: 'contacted' };

  const targets = await Lead.find(query).lean();
  if (!targets.length) return res.status(400).json({ error: 'No leads with email in this category' });

  const transporter = getTransporter();
  const templatesToSend = template === 'all'
    ? ['proposal', 'followup-1', 'followup-2', 'followup-3']
    : [template];

  const results = [];

  for (const leadData of targets) {
    const lead = await Lead.findById(leadData._id);
    for (const tmpl of templatesToSend) {
      try {
        const templateFile = tmpl === 'proposal'
          ? path.join(__dirname, '..', 'proposals', 'd2c-email.html')
          : path.join(__dirname, '..', 'proposals', `d2c-${tmpl}.html`);
        const templateId = tmpl;
        const { html, brandName } = buildEmail(templateFile, lead, templateId);

        const SUBJECTS = {
          proposal: `${brandName} × Antortiq — We built something for you`,
          'followup-1': FOLLOWUP_SUBJECTS[1](brandName),
          'followup-2': FOLLOWUP_SUBJECTS[2](brandName),
          'followup-3': FOLLOWUP_SUBJECTS[3](brandName),
        };

        await transporter.sendMail({
          from: `"Antortiq" <${process.env.SMTP_USER}>`,
          to: lead.email,
          subject: SUBJECTS[tmpl] || `${brandName} × Antortiq`,
          html,
        });

        if (tmpl === 'proposal') {
          lead.status = 'contacted';
          lead.proposal_sent_at = new Date();
        } else {
          const d = tmpl.replace('followup-', '');
          lead[`followup_${d}_sent_at`] = new Date();
        }
        await lead.save();
        results.push({ handle: lead.handle, template: tmpl, ok: true });
        await new Promise(r => setTimeout(r, 15000));
      } catch (err) {
        results.push({ handle: lead.handle, template: tmpl, ok: false, error: err.message });
      }
    }
  }

  const sent = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;
  res.json({ ok: true, sent, failed, total_leads: targets.length, results });
});

// PATCH /api/leads/:handle/status
router.patch('/:handle/status', async (req, res) => {
  const { status } = req.body || {};
  if (!status) return res.status(400).json({ error: 'status is required' });
  const lead = await Lead.findOneAndUpdate({ handle: req.params.handle }, { status }, { new: true });
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  res.json(lead);
});

module.exports = router;
