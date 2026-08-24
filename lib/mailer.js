const nodemailer = require('nodemailer');

const PITCH_URL = (process.env.APP_URL || 'https://antortiq.onrender.com') + '/antortiq-pitch-deck.html';
const DEMO_WA  = 'https://wa.me/918209544626?text=Hi%2C%20I%27m%20interested%20in%20Antortiq%20for%20my%20Shopify%20store';

function getTransport() {
  if (!process.env.SMTP_HOST) throw new Error('SMTP_HOST not set in .env');
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

function buildHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Antortiq — Post-purchase for D2C brands</title>
</head>
<body style="margin:0;padding:0;background-color:#0a0a0b;font-family:Arial,Helvetica,sans-serif;">

<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#0a0a0b;">
  <tr><td align="center" style="padding:32px 16px 48px;">

    <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

      <!-- HEADER -->
      <tr>
        <td style="padding-bottom:28px;border-bottom:1px solid #232327;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="font-family:Arial,sans-serif;font-size:20px;font-weight:900;color:#f0f0f2;letter-spacing:-0.5px;">
                Antorti<span style="color:#e8344a;">q</span>
              </td>
              <td align="right">
                <span style="font-family:monospace;font-size:10px;color:#1f9d62;border:1px solid #1a3a1a;border-radius:99px;padding:4px 12px;">● Systems Live</span>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- HERO -->
      <tr>
        <td style="padding:40px 0 32px;">
          <p style="margin:0 0 14px;font-family:monospace;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:#e8344a;">Built for D2C · India · 2025</p>
          <h1 style="margin:0 0 16px;font-family:Arial,sans-serif;font-size:38px;font-weight:900;line-height:1.1;letter-spacing:-1px;color:#ffffff;">
            Stop losing orders to a<br><span style="color:#e8344a;">broken post-purchase.</span>
          </h1>
          <p style="margin:0 0 28px;font-size:15px;color:#9a9ba1;line-height:1.7;">
            We plug directly into your Shopify store and handle everything after the order —
            WhatsApp confirmations, live tracking, returns & exchange, and an ops panel built for your team.
            <strong style="color:#f0f0f2;">3-day setup. One-time cost. No subscriptions.</strong>
          </p>
        </td>
      </tr>

      <!-- STATS ROW -->
      <tr>
        <td style="padding-bottom:36px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #232327;border-radius:12px;overflow:hidden;">
            <tr>
              <td width="33%" align="center" style="background-color:#141416;padding:20px 12px;border-right:1px solid #232327;">
                <div style="font-family:Arial,sans-serif;font-size:36px;font-weight:900;color:#e8344a;line-height:1;">38%</div>
                <div style="font-size:10px;color:#6b6c70;margin-top:6px;">COD orders never confirmed</div>
              </td>
              <td width="33%" align="center" style="background-color:#141416;padding:20px 12px;border-right:1px solid #232327;">
                <div style="font-family:Arial,sans-serif;font-size:36px;font-weight:900;color:#e8344a;line-height:1;">4.2×</div>
                <div style="font-size:10px;color:#6b6c70;margin-top:6px;">RTO reduction seen</div>
              </td>
              <td width="33%" align="center" style="background-color:#141416;padding:20px 12px;">
                <div style="font-family:Arial,sans-serif;font-size:36px;font-weight:900;color:#e8344a;line-height:1;">3 days</div>
                <div style="font-size:10px;color:#6b6c70;margin-top:6px;">to go fully live</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>

      <!-- WHAT YOU GET -->
      <tr>
        <td style="padding-bottom:10px;">
          <p style="margin:0 0 20px;font-family:monospace;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:#6b6c70;border-bottom:1px solid #232327;padding-bottom:12px;">What You Get</p>
        </td>
      </tr>

      <!-- Feature 1 -->
      <tr>
        <td style="background-color:#141416;border:1px solid #232327;border-radius:14px;padding:20px 22px;margin-bottom:14px;">
          <p style="margin:0 0 4px;font-family:monospace;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#e8344a;font-weight:700;">WhatsApp Automation</p>
          <p style="margin:0 0 6px;font-size:16px;font-weight:700;color:#ffffff;">Order Confirmation &amp; Updates</p>
          <p style="margin:0;font-size:13px;color:#9a9ba1;line-height:1.55;">COD confirmation, shipping alerts, and delivery nudges sent straight to your customer's WhatsApp the moment each stage changes.</p>
        </td>
      </tr>
      <tr><td style="height:10px;"></td></tr>

      <!-- Feature 2 -->
      <tr>
        <td style="background-color:#141416;border:1px solid #232327;border-radius:14px;padding:20px 22px;">
          <p style="margin:0 0 4px;font-family:monospace;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#e8344a;font-weight:700;">Customer-Facing Page</p>
          <p style="margin:0 0 6px;font-size:16px;font-weight:700;color:#ffffff;">Track, Return &amp; Exchange Page</p>
          <p style="margin:0;font-size:13px;color:#9a9ba1;line-height:1.55;">A single branded page — confirm if pending, track if shipped, return or exchange if delivered. No login needed.</p>
        </td>
      </tr>
      <tr><td style="height:10px;"></td></tr>

      <!-- Feature 3 -->
      <tr>
        <td style="background-color:#141416;border:1px solid #232327;border-radius:14px;padding:20px 22px;">
          <p style="margin:0 0 4px;font-family:monospace;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#e8344a;font-weight:700;">Ops Dashboard</p>
          <p style="margin:0 0 6px;font-size:16px;font-weight:700;color:#ffffff;">Full Order Management Panel</p>
          <p style="margin:0;font-size:13px;color:#9a9ba1;line-height:1.55;">Live overview across all orders — confirmation rates, courier stages, revenue stuck, and admin alerts. Built for your ops team.</p>
        </td>
      </tr>
      <tr><td style="height:32px;"></td></tr>

      <!-- VIEW FULL PITCH BUTTON -->
      <tr>
        <td align="center" style="padding-bottom:20px;">
          <a href="${PITCH_URL}" style="display:inline-block;background-color:#141416;color:#f0f0f2;font-family:Arial,sans-serif;font-size:14px;font-weight:700;text-decoration:none;padding:13px 28px;border-radius:8px;border:1px solid #232327;">
            View Full Product Deck →
          </a>
        </td>
      </tr>

      <!-- CTA BLOCK -->
      <tr>
        <td style="background:linear-gradient(135deg,#7a0f0f,#e8344a);border-radius:16px;padding:36px 32px;text-align:center;">
          <h2 style="margin:0 0 10px;font-family:Arial,sans-serif;font-size:24px;font-weight:900;color:#ffffff;letter-spacing:-0.5px;line-height:1.2;">Get your store live in 3 days — not 3 months.</h2>
          <p style="margin:0 0 24px;font-size:14px;color:rgba(255,255,255,0.8);">One-time setup. No subscriptions. No per-order fees.</p>
          <a href="${DEMO_WA}" style="display:inline-block;background-color:#0a0a0b;color:#ffffff;font-family:Arial,sans-serif;font-size:14px;font-weight:700;text-decoration:none;padding:13px 32px;border-radius:99px;">
            Book a Free Demo on WhatsApp →
          </a>
          <p style="margin:14px 0 0;font-family:monospace;font-size:10px;color:rgba(255,255,255,0.45);letter-spacing:0.05em;">Typical range: ₹3,999 – ₹24,999 · One-time · 3-day delivery</p>
        </td>
      </tr>

      <!-- FOOTER -->
      <tr>
        <td style="padding-top:28px;border-top:1px solid #232327;margin-top:36px;">
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:36px;">
            <tr>
              <td style="font-family:Arial,sans-serif;font-size:14px;font-weight:900;color:#6b6c70;">Antorti<span style="color:#e8344a;">q</span></td>
              <td align="right" style="font-size:11px;color:#6b6c70;">
                <a href="#" style="color:#6b6c70;text-decoration:none;margin-left:16px;">Unsubscribe</a>
              </td>
            </tr>
            <tr>
              <td colspan="2" style="font-size:11px;color:#6b6c70;padding-top:6px;">© 2025 Antortiq · Built for Indian D2C brands</td>
            </tr>
          </table>
        </td>
      </tr>

    </table>
  </td></tr>
</table>

</body>
</html>`;
}

async function sendPitchEmail(to) {
  const transport = getTransport();
  const info = await transport.sendMail({
    from: `"Antortiq" <${process.env.SMTP_USER}>`,
    to,
    subject: 'Your post-purchase experience is losing you money — Antortiq',
    html: buildHtml(),
    text: `Hi,\n\nWe build post-purchase automation for D2C brands on Shopify — WhatsApp confirmations, live tracking, returns & exchange, and an ops panel.\n\nView full pitch: ${PITCH_URL}\n\nOne-time setup. 3-day delivery. ₹3,999–₹24,999.\n\nBook a free demo: https://wa.me/918209544626\n\n— Antortiq Team`,
  });
  console.log(`[mailer] Pitch sent to ${to} — messageId: ${info.messageId}`);
  return info;
}

module.exports = { sendPitchEmail };
