const express = require('express');
const fs = require('fs');
const path = require('path');

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
