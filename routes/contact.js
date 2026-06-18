const express = require('express');
const nodemailer = require('nodemailer');

const router = express.Router();

function getTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

router.post('/', async (req, res) => {
  const { name, email, message } = req.body || {};

  if (!name || !email || !message) {
    return res.status(400).json({ error: 'name, email and message are required' });
  }

  if (!process.env.SMTP_HOST) {
    return res.status(500).json({ error: 'Email is not configured yet' });
  }

  try {
    const transporter = getTransporter();
    await transporter.sendMail({
      from: `"Antortiq Website" <${process.env.SMTP_USER}>`,
      to: process.env.CONTACT_TO || process.env.SMTP_USER,
      replyTo: email,
      subject: `New inquiry from ${name}`,
      text: `From: ${name} <${email}>\n\n${message}`,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('Failed to send contact email', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

module.exports = router;
