const { Resend } = require('resend');
const fs = require('fs');
const path = require('path');

const PITCH_TEMPLATE = path.join(__dirname, '../proposals/antortiq-pitch-email.html');
const DEMO_WA = 'https://wa.me/918209544626?text=Hi%2C%20I%27m%20interested%20in%20Antortiq';

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

function buildHtml() {
  return fs.readFileSync(PITCH_TEMPLATE, 'utf8');
}

async function sendPitchEmail(to) {
  const resend = getResend();
  const { data, error } = await resend.emails.send({
    from: 'Antortiq <team@antortiq.com>',
    to,
    subject: 'Your post-purchase experience is losing you money — Antortiq',
    html: buildHtml(),
    text: `Hi,\n\nWe build post-purchase automation for D2C brands on Shopify — WhatsApp confirmations, live tracking, returns & exchange, and an ops panel.\n\nOne-time setup. 3-day delivery. ₹3,999–₹24,999.\n\nBook a free demo: ${DEMO_WA}\n\n— Antortiq Team`,
  });
  if (error) throw new Error(error.message);
  console.log(`[mailer] Pitch sent to ${to} — id: ${data.id}`);
  return data;
}

module.exports = { sendPitchEmail };
