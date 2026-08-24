const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

const TEMPLATE_PATH = path.join(__dirname, 'pitch-template.html');

function getTransport() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS, // Gmail App Password
    },
  });
}

function buildHtml() {
  const raw = fs.readFileSync(TEMPLATE_PATH, 'utf-8');
  // Wrap in a full HTML document for email clients
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">${raw}</head><body style="margin:0;padding:0;background:#0a0a0b;">${raw}</body></html>`;
}

async function sendPitchEmail(to) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    throw new Error('EMAIL_USER and EMAIL_PASS not set in .env');
  }

  const transport = getTransport();
  const html = buildHtml();

  const info = await transport.sendMail({
    from: `"Antortiq" <${process.env.EMAIL_USER}>`,
    to,
    subject: 'Your post-purchase experience is losing you money — Antortiq',
    html,
    text: `Hi,\n\nWe build post-purchase automation for D2C brands on Shopify — WhatsApp confirmations, live tracking, returns & exchange, and an ops panel.\n\nOne-time setup. 3-day delivery. ₹3,999–₹24,999.\n\nBook a free demo: https://wa.me/918209544626\n\n— Antortiq Team`,
  });

  console.log(`[mailer] Pitch email sent to ${to} — messageId: ${info.messageId}`);
  return info;
}

module.exports = { sendPitchEmail };
