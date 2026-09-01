const express = require('express');
const router = express.Router();
const { Resend } = require('resend');
const { sendPitchEmail } = require('../lib/mailer');

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

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

// POST /api/mail/proposal  { to, clientName, html }
router.post('/proposal', auth, async (req, res) => {
  const { to, clientName, html } = req.body;
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return res.status(400).json({ error: 'Valid email required' });
  }
  if (!html) return res.status(400).json({ error: 'Proposal HTML missing' });
  try {
    const resend = getResend();
    const { data, error } = await resend.emails.send({
      from: 'Antortiq <onboarding@resend.dev>',
      to,
      subject: `Your Antortiq Proposal${clientName ? ' — ' + clientName : ''}`,
      html,
      text: `Hi${clientName ? ' ' + clientName : ''},\n\nPlease find your custom Antortiq proposal below.\n\nIf you have any questions, reply to this email or WhatsApp us at wa.me/918209544626\n\n— Antortiq Team`,
    });
    if (error) throw new Error(error.message);
    console.log(`[mailer] Proposal sent to ${to} — ${data.id}`);
    res.json({ ok: true, sent_to: to });
  } catch (e) {
    console.error('[mailer proposal]', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
