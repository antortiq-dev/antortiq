const nodemailer = require('nodemailer');
const juice = require('juice');
const fs = require('fs');
const path = require('path');

const TEMPLATE_PATH = path.join(__dirname, 'pitch-template.html');

function getTransport() {
  if (!process.env.SMTP_HOST) throw new Error('SMTP_HOST not set in .env');
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

function buildHtml() {
  const raw = fs.readFileSync(TEMPLATE_PATH, 'utf-8');

  // Wrap in a full document so juice can resolve <style> blocks
  const full = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#0a0a0b;">
${raw}
</body>
</html>`;

  // Inline all CSS so Gmail doesn't strip it
  return juice(full, {
    removeStyleTags: false,    // keep <style> as fallback for clients that support it
    applyStyleTags: true,
    preserveMediaQueries: true,
    preserveFontFaces: true,
  });
}

async function sendPitchEmail(to) {
  const transport = getTransport();
  const html = buildHtml();
  const info = await transport.sendMail({
    from: `"Antortiq" <${process.env.SMTP_USER}>`,
    to,
    subject: 'Your post-purchase experience is losing you money — Antortiq',
    html,
    text: `Hi,\n\nWe build post-purchase automation for D2C brands on Shopify — WhatsApp confirmations, live tracking, returns & exchange, and an ops panel.\n\nOne-time setup. 3-day delivery. ₹3,999–₹24,999.\n\nBook a free demo: https://wa.me/918209544626\n\n— Antortiq Team`,
  });
  console.log(`[mailer] Pitch sent to ${to} — messageId: ${info.messageId}`);
  return info;
}

module.exports = { sendPitchEmail };
