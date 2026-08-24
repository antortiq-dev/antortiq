const express = require('express');
const router = express.Router();
const { sendPitchEmail } = require('../lib/mailer');

const ADMIN_KEY = process.env.ADMIN_API_KEY || 'antortiq-admin-2025';

function auth(req, res, next) {
  if (req.headers['x-admin-key'] !== ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// POST /api/mail/pitch  { to: "email@example.com" }
router.post('/pitch', auth, async (req, res) => {
  const { to } = req.body;
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return res.status(400).json({ error: 'Valid email address required' });
  }
  try {
    await sendPitchEmail(to);
    res.json({ ok: true, sent_to: to });
  } catch (e) {
    console.error('[mailer route]', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
