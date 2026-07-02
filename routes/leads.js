const express = require('express');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const router = express.Router();
const LEADS_FILE = path.join(__dirname, '..', 'data', 'leads.json');

function readLeads() {
  if (!fs.existsSync(LEADS_FILE)) return [];
  return JSON.parse(fs.readFileSync(LEADS_FILE, 'utf8'));
}

function writeLeads(leads) {
  fs.writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2));
}

router.get('/', (req, res) => {
  res.json(readLeads());
});

// Instagram's CDN sets Cross-Origin-Resource-Policy: same-origin, which
// makes browsers refuse to load the avatar directly even though the URL
// itself is valid. Proxying through our own origin sidesteps that (CORP
// is a browser-enforced rule, not something a server-to-server fetch hits).
router.get('/avatar', async (req, res) => {
  const { url } = req.query;
  if (!url || !url.startsWith('https://') || !url.includes('cdninstagram.com')) {
    return res.status(400).send('Invalid avatar URL');
  }
  try {
    const upstream = await fetch(url);
    if (!upstream.ok) return res.status(upstream.status).send('Upstream error');
    res.set('Content-Type', upstream.headers.get('content-type') || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.send(buffer);
  } catch (err) {
    res.status(502).send('Failed to fetch avatar');
  }
});

router.post('/:handle/send-proposal', async (req, res) => {
  const leads = readLeads();
  const lead = leads.find((l) => l.handle === req.params.handle);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  const toEmail = req.body.email || lead.email;
  if (!toEmail) return res.status(400).json({ error: 'No email address for this lead' });

  const brandName = lead.name || lead.handle;
  const brandDomain = lead.website
    ? lead.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, '').split('.')[0]
    : lead.handle;
  const brandNameEncoded = encodeURIComponent(brandName);
  const proposalLink = `https://antortiq.onrender.com/d2c-proposal.html?brand=${brandNameEncoded}`;
  const trackBase = `https://antortiq.onrender.com/api/track`;
  const clickTracked = `${trackBase}/click/${brandNameEncoded}/proposal?to=${encodeURIComponent(proposalLink)}`;
  const openPixel = `${trackBase}/open/${brandNameEncoded}/proposal`;

  const emailTemplate = fs.readFileSync(
    path.join(__dirname, '..', 'proposals', 'd2c-email.html'),
    'utf8'
  );

  const html = emailTemplate
    .replace(/\{\{BRAND_NAME\}\}/g, brandName)
    .replace(/\{\{BRAND_NAME_UPPER\}\}/g, brandName.toUpperCase())
    .replace(/\{\{BRAND_DOMAIN\}\}/g, brandDomain)
    .replace(/\{\{BRAND_NAME_ENCODED\}\}/g, brandNameEncoded)
    .replace(/\{\{PROPOSAL_LINK\}\}/g, clickTracked)
    .replace(/\{\{OPEN_PIXEL\}\}/g, openPixel);

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  try {
    await transporter.sendMail({
      from: `"Antortiq" <${process.env.SMTP_USER}>`,
      to: toEmail,
      subject: `${brandName} × Antortiq — We built something for you`,
      html,
    });

    // mark lead as contacted
    lead.status = 'contacted';
    lead.proposal_sent_at = new Date().toISOString();
    writeLeads(leads);

    res.json({ ok: true, sent_to: toEmail, proposal_link: proposalLink });
  } catch (err) {
    console.error('Send proposal error:', err);
    res.status(500).json({ error: 'Failed to send email', detail: err.message });
  }
});

const FOLLOWUP_SUBJECTS = {
  1: (brand) => `${brand} — quick follow-up (day 2)`,
  2: (brand) => `${brand} — do you know these numbers about your own brand?`,
  3: (brand) => `${brand} — last one. here's what your emails should look like.`,
};

router.post('/:handle/send-followup/:day', async (req, res) => {
  const day = Number(req.params.day);
  if (![1, 2, 3].includes(day)) return res.status(400).json({ error: 'day must be 1, 2, or 3' });

  const leads = readLeads();
  const lead = leads.find((l) => l.handle === req.params.handle);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  const toEmail = req.body.email || lead.email;
  if (!toEmail) return res.status(400).json({ error: 'No email address for this lead' });

  const brandName = lead.name || lead.handle;
  const brandDomain = lead.website
    ? lead.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, '').split('.')[0]
    : lead.handle;
  const brandNameEncoded = encodeURIComponent(brandName);
  const proposalLink = `https://antortiq.onrender.com/d2c-proposal.html?brand=${brandNameEncoded}`;
  const templateId = `followup-${day}`;
  const trackBase = `https://antortiq.onrender.com/api/track`;
  const clickTracked = `${trackBase}/click/${brandNameEncoded}/${templateId}?to=${encodeURIComponent(proposalLink)}`;
  const openPixel = `${trackBase}/open/${brandNameEncoded}/${templateId}`;

  const templateFile = path.join(__dirname, '..', 'proposals', `d2c-followup-${day}.html`);
  const emailTemplate = fs.readFileSync(templateFile, 'utf8');

  const html = emailTemplate
    .replace(/\{\{BRAND_NAME\}\}/g, brandName)
    .replace(/\{\{BRAND_NAME_UPPER\}\}/g, brandName.toUpperCase())
    .replace(/\{\{BRAND_DOMAIN\}\}/g, brandDomain)
    .replace(/\{\{BRAND_NAME_ENCODED\}\}/g, brandNameEncoded)
    .replace(/\{\{PROPOSAL_LINK\}\}/g, clickTracked)
    .replace(/\{\{OPEN_PIXEL\}\}/g, openPixel);

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  try {
    await transporter.sendMail({
      from: `"Antortiq" <${process.env.SMTP_USER}>`,
      to: toEmail,
      subject: FOLLOWUP_SUBJECTS[day](brandName),
      html,
    });

    lead[`followup_${day}_sent_at`] = new Date().toISOString();
    writeLeads(leads);

    res.json({ ok: true, sent_to: toEmail, day, proposal_link: proposalLink });
  } catch (err) {
    console.error('Send followup error:', err);
    res.status(500).json({ error: 'Failed to send email', detail: err.message });
  }
});

// GET /api/leads/categories — list all categories with counts
router.get('/categories', (req, res) => {
  const leads = readLeads();
  const cats = {};
  leads.forEach(l => {
    const c = l.category || 'Uncategorized';
    if (!cats[c]) cats[c] = { category: c, total: 0, with_email: 0 };
    cats[c].total++;
    if (l.email) cats[c].with_email++;
  });
  res.json(Object.values(cats).sort((a, b) => b.total - a.total));
});

// POST /api/leads/bulk-send — send a template to all leads in a category
router.post('/bulk-send', async (req, res) => {
  const { category, template, skip_contacted } = req.body || {};
  if (!category) return res.status(400).json({ error: 'category required' });
  if (!template) return res.status(400).json({ error: 'template required' });

  const leads = readLeads();
  const targets = leads.filter(l =>
    (category === 'all' || l.category === category) &&
    l.email &&
    (!skip_contacted || l.status !== 'contacted')
  );
  if (!targets.length) return res.status(400).json({ error: 'No leads with email in this category' });

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });

  // Determine which templates to send
  const templatesToSend = template === 'all'
    ? ['proposal', 'followup-1', 'followup-2', 'followup-3']
    : [template];

  const results = [];

  for (const lead of targets) {
    const brandName = lead.name || lead.handle;
    const brandDomain = lead.website
      ? lead.website.replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, '').split('.')[0]
      : lead.handle;
    const brandNameEncoded = encodeURIComponent(brandName);
    const proposalLink = `https://antortiq.onrender.com/d2c-proposal.html?brand=${brandNameEncoded}`;
    const trackBase = `https://antortiq.onrender.com/api/track`;

    for (const tmpl of templatesToSend) {
      try {
        const templateFile = tmpl === 'proposal'
          ? path.join(__dirname, '..', 'proposals', 'd2c-email.html')
          : path.join(__dirname, '..', 'proposals', `d2c-${tmpl}.html`);

        const templateId = tmpl === 'proposal' ? 'proposal' : tmpl;
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

        const SUBJECTS = {
          proposal: `${brandName} × Antortiq — We built something for you`,
          'followup-1': `${brandName} — quick follow-up (day 2)`,
          'followup-2': `${brandName} — do you know these numbers about your own brand?`,
          'followup-3': `${brandName} — last one. here's what your emails should look like.`,
        };

        await transporter.sendMail({
          from: `"Antortiq" <${process.env.SMTP_USER}>`,
          to: lead.email,
          subject: SUBJECTS[templateId] || `${brandName} × Antortiq`,
          html,
        });

        // Mark sent
        if (tmpl === 'proposal') {
          lead.status = 'contacted';
          lead.proposal_sent_at = new Date().toISOString();
        } else {
          const day = tmpl.replace('followup-', '');
          lead[`followup_${day}_sent_at`] = new Date().toISOString();
        }

        results.push({ handle: lead.handle, template: tmpl, ok: true });

        // Small delay to avoid SMTP rate limiting
        await new Promise(r => setTimeout(r, 300));
      } catch (err) {
        results.push({ handle: lead.handle, template: tmpl, ok: false, error: err.message });
      }
    }
  }

  writeLeads(leads);
  const succeeded = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok).length;
  res.json({ ok: true, sent: succeeded, failed, total_leads: targets.length, results });
});

router.patch('/:handle/status', (req, res) => {
  const { status } = req.body || {};
  if (!status) return res.status(400).json({ error: 'status is required' });

  const leads = readLeads();
  const lead = leads.find((l) => l.handle === req.params.handle);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  lead.status = status;
  writeLeads(leads);
  res.json(lead);
});

module.exports = router;
