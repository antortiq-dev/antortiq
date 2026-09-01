const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

const PITCH_TEMPLATE = path.join(__dirname, '../proposals/antortiq-pitch-email.html');
const DEMO_WA = 'https://wa.me/918209544626?text=Hi%2C%20I%27m%20interested%20in%20Antortiq';

function getTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

function buildHtml() {
  return fs.readFileSync(PITCH_TEMPLATE, 'utf8');
}

async function sendPitchEmail(to) {
  const transport = getTransport();
  const info = await transport.sendMail({
    from: `"Antortiq" <${process.env.SMTP_USER}>`,
    to,
    subject: 'Your post-purchase experience is losing you money — Antortiq',
    html: buildHtml(),
    text: `Hi,\n\nWe build post-purchase automation for D2C brands on Shopify — WhatsApp confirmations, live tracking, returns & exchange, and an ops panel.\n\nOne-time setup. 3-day delivery. ₹3,999–₹24,999.\n\nBook a free demo: ${DEMO_WA}\n\n— Antortiq Team`,
  });
  console.log(`[mailer] Pitch sent to ${to} — messageId: ${info.messageId}`);
  return info;
}

module.exports = { sendPitchEmail };
