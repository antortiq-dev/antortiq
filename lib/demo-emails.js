// Demo email templates for Antortiq sales demos
// Adapted from Croscrow production templates — same banner images, ANTORTIQ branding
const nodemailer = require('nodemailer');

function getTransport() {
  if (!process.env.SMTP_HOST) throw new Error('SMTP_HOST not set');
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    tls: { rejectUnauthorized: false },
    connectionTimeout: 30000,
    greetingTimeout: 15000,
  });
}

async function sendDemoEmails(toEmail) {
  console.log(`[demo-email] starting — to: ${toEmail}`);
  console.log(`[demo-email] SMTP: host=${process.env.SMTP_HOST} port=${process.env.SMTP_PORT} user=${process.env.SMTP_USER}`);
  const transport = getTransport();
  const from = `"Antortiq" <${process.env.SMTP_USER}>`;
  const templates = [emailShipped(), emailOfd(), emailReturnVendor()];
  for (const t of templates) {
    console.log(`[demo-email] sending: ${t.subject}`);
    const info = await transport.sendMail({ from, to: toEmail, subject: t.subject, html: t.html });
    console.log(`[demo-email] sent: ${info.messageId}`);
    await new Promise(r => setTimeout(r, 600));
  }
  console.log(`[demo-email] all 3 sent to ${toEmail}`);
}

const BANNER = 'https://i.ibb.co/YFCVGFxR/Concrete-is-a-construct-So-are-the-rules-The-jungle-isn-t-wild-it-s-designed.jpg';
const LOGO   = 'https://i.ibb.co/DHx0VCZb/Untitled-design-1.jpg';

const DEMO_ORDER = {
  name: '#3037',
  total_price: '1835.00',
  financial_status: 'pending', // COD
  shipping_address: {
    first_name: 'Harsh',
    name: 'Harsh Vijay',
    address1: '12, Shiv Nagar Colony',
    city: 'Jaipur',
    province: 'Rajasthan',
    zip: '302001',
    phone: '+91 98765 43210',
  },
  line_items: [
    { title: 'Oversized Tee', variant_title: 'Black / L', quantity: 1, price: '1835.00' },
  ],
  email: 'customer@example.com',
};

const DEMO_AWB     = '80146005251';
const DEMO_COURIER = 'BlueDart';
const DEMO_TRACK   = 'https://dashboard.croscrow.com/o/3037';
const DEMO_RR_ID   = 'RR-2864-A';

function trackBtn(url, label = 'Track Your Order →') {
  return `<div style="text-align:center;margin:28px 0;">
    <a href="${url}" target="_blank" style="display:inline-block;background:#7eb8f7;color:#0d0d0d;font-size:14px;font-weight:900;letter-spacing:2px;text-transform:uppercase;padding:16px 40px;border-radius:3px;text-decoration:none;">${label}</a>
  </div>`;
}

function footer() {
  return `<div style="background:#0d0d0d;padding:32px;text-align:center;border-top:1px solid #1a1a1a;">
    <img src="${LOGO}" width="160" alt="Antortiq" style="display:inline-block;margin-bottom:14px;border-radius:6px;">
    <div style="font-size:11px;color:#444;line-height:1.8;">Questions? Reach us on WhatsApp or reply to this email.</div>
    <div style="font-size:9px;color:#2a2a2a;margin-top:16px;letter-spacing:2px;text-transform:uppercase;">&#169; ANTORTIQ &middot; Automated Notification &middot; Powered by Antortiq</div>
  </div>`;
}

// ── 1. ORDER SHIPPED (customer) ───────────────────────────────────────────────
function emailShipped() {
  const o = DEMO_ORDER;
  const addr = o.shipping_address;
  return {
    subject: `Your Order is Shipped! 🚚  AWB: ${DEMO_AWB}`,
    html: `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0d0d0d;font-family:Arial,sans-serif;">
<div style="max-width:620px;margin:0 auto;">

  <div style="position:relative;line-height:0;">
    <img src="${BANNER}" width="620" alt="Antortiq" style="width:100%;max-width:620px;display:block;object-fit:cover;max-height:340px;">
    <div style="position:absolute;bottom:0;left:0;right:0;padding:28px 32px;background:linear-gradient(to top,rgba(0,0,0,0.92) 0%,rgba(0,0,0,0.4) 70%,transparent 100%);">
      <div style="font-size:9px;font-weight:700;letter-spacing:4px;color:rgba(255,255,255,0.45);text-transform:uppercase;margin-bottom:8px;">SHIPPED &nbsp;|&nbsp; ON THE MOVE</div>
      <div style="font-size:28px;font-weight:900;color:#ffffff;letter-spacing:3px;text-transform:uppercase;line-height:1.1;">YOUR ORDER<br>IS ON ITS WAY.</div>
    </div>
  </div>

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#111111;">
    <tr>
      <td style="padding:18px 32px;">
        <div style="font-size:9px;letter-spacing:4px;color:#555;text-transform:uppercase;margin-bottom:4px;">Order ID</div>
        <div style="font-size:20px;font-weight:900;color:#ffffff;letter-spacing:2px;">${o.name}</div>
      </td>
      <td style="padding:18px 32px;text-align:right;">
        <div style="font-size:9px;letter-spacing:4px;color:#555;text-transform:uppercase;margin-bottom:4px;">To Pay on Delivery</div>
        <div style="font-size:20px;font-weight:900;color:#7eb8f7;letter-spacing:1px;">&#8377;${o.total_price}</div>
      </td>
    </tr>
  </table>

  <div style="background:#161616;padding:32px;">
    <div style="margin-bottom:24px;">
      <div style="font-size:17px;font-weight:700;color:#f0f0f0;margin-bottom:6px;">Hey ${addr.first_name} —</div>
      <div style="font-size:13px;color:#888;line-height:1.8;">Your order has left the facility and is on its way to you. Estimated delivery in 3–7 business days. Please keep <strong style="color:#f0f0f0;">&#8377;${o.total_price}</strong> ready for cash on delivery.</div>
    </div>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#111;border:1px solid #1e1e1e;border-radius:8px;margin-bottom:24px;">
      <tr>
        <td style="padding:14px 20px;">
          <div style="font-size:9px;letter-spacing:3px;color:#444;text-transform:uppercase;margin-bottom:4px;">Courier</div>
          <div style="font-size:13px;font-weight:700;color:#ccc;">${DEMO_COURIER}</div>
        </td>
        <td style="padding:14px 20px;text-align:right;">
          <div style="font-size:9px;letter-spacing:3px;color:#444;text-transform:uppercase;margin-bottom:4px;">Tracking AWB</div>
          <div style="font-size:13px;font-weight:700;color:#7eb8f7;font-family:monospace;">${DEMO_AWB}</div>
        </td>
      </tr>
    </table>

    <div style="font-size:9px;font-weight:700;letter-spacing:4px;color:#444;text-transform:uppercase;margin-bottom:14px;">Your Items</div>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-bottom:1px solid #1e1e1e;">
      <tr>
        <td style="padding:14px 14px 14px 0;width:64px;vertical-align:top;"><div style="width:60px;height:60px;background:#1e1e1e;border-radius:6px;"></div></td>
        <td style="padding:14px 0;vertical-align:top;">
          <div style="font-size:13px;font-weight:700;color:#e8e8e8;">Oversized Tee</div>
          <div style="font-size:10px;color:#555;margin-top:3px;letter-spacing:1px;">Black / L</div>
          <div style="font-size:9px;letter-spacing:3px;color:#444;margin-top:5px;text-transform:uppercase;">Qty 1</div>
        </td>
        <td style="padding:14px 0;text-align:right;vertical-align:top;">
          <div style="font-size:14px;font-weight:800;color:#f0f0f0;">&#8377;1835.00</div>
        </td>
      </tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;background:#0f0f0f;border-radius:6px;">
      <tr>
        <td style="padding:16px 20px;font-size:10px;font-weight:700;letter-spacing:3px;color:#555;text-transform:uppercase;">Order Total</td>
        <td style="padding:16px 20px;text-align:right;font-size:20px;font-weight:900;color:#7eb8f7;">&#8377;${o.total_price}</td>
      </tr>
    </table>

    <div style="margin-bottom:24px;">
      <div style="font-size:9px;font-weight:700;letter-spacing:4px;color:#444;text-transform:uppercase;margin-bottom:12px;">Delivering To</div>
      <div style="font-size:13px;color:#888;line-height:1.9;">
        <span style="font-weight:700;color:#ccc;">${addr.name}</span><br>
        ${addr.address1}<br>${addr.city}, ${addr.province} ${addr.zip}
      </div>
    </div>

    ${trackBtn(DEMO_TRACK)}
  </div>

  ${footer()}
</div>
</body></html>`,
  };
}

// ── 2. OUT FOR DELIVERY (customer) ────────────────────────────────────────────
function emailOfd() {
  const o = DEMO_ORDER;
  const addr = o.shipping_address;
  return {
    subject: `Get Ready — ${o.name} is Out for Delivery Today! 🛵`,
    html: `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0d0d0d;font-family:Arial,sans-serif;">
<div style="max-width:620px;margin:0 auto;">

  <div style="position:relative;line-height:0;">
    <img src="${BANNER}" width="620" alt="Antortiq" style="width:100%;max-width:620px;display:block;object-fit:cover;max-height:340px;">
    <div style="position:absolute;bottom:0;left:0;right:0;padding:28px 32px;background:linear-gradient(to top,rgba(0,0,0,0.92) 0%,rgba(0,0,0,0.4) 70%,transparent 100%);">
      <div style="font-size:9px;font-weight:700;letter-spacing:4px;color:rgba(255,255,255,0.45);text-transform:uppercase;margin-bottom:8px;">OUT FOR DELIVERY &nbsp;|&nbsp; TODAY</div>
      <div style="font-size:26px;font-weight:900;color:#ffffff;letter-spacing:3px;text-transform:uppercase;line-height:1.1;">GET READY —<br>IT ARRIVES TODAY.</div>
    </div>
  </div>

  <table width="100%" cellpadding="0" cellspacing="0" style="background:#111111;">
    <tr>
      <td style="padding:18px 32px;">
        <div style="font-size:9px;letter-spacing:4px;color:#555;text-transform:uppercase;margin-bottom:4px;">Order ID</div>
        <div style="font-size:20px;font-weight:900;color:#ffffff;letter-spacing:2px;">${o.name}</div>
      </td>
      <td style="padding:18px 32px;text-align:right;">
        <div style="font-size:9px;letter-spacing:4px;color:#555;text-transform:uppercase;margin-bottom:4px;">To Pay on Delivery</div>
        <div style="font-size:20px;font-weight:900;color:#7eb8f7;letter-spacing:1px;">&#8377;${o.total_price}</div>
      </td>
    </tr>
  </table>

  <div style="background:#161616;padding:32px;">
    <div style="margin-bottom:24px;">
      <div style="font-size:17px;font-weight:700;color:#f0f0f0;margin-bottom:6px;">Hey ${addr.first_name} —</div>
      <div style="font-size:13px;color:#888;line-height:1.8;">Your order is out for delivery. Keep your phone nearby — the delivery agent is on the way! Please keep <strong style="color:#f0f0f0;">&#8377;${o.total_price}</strong> ready.</div>
    </div>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#0d1520;border:1px solid #1a3a6a;border-radius:8px;margin-bottom:24px;">
      <tr><td style="padding:20px 24px;text-align:center;">
        <div style="font-size:36px;margin-bottom:8px;">🛵</div>
        <div style="font-size:16px;font-weight:800;color:#7eb8f7;letter-spacing:1px;margin-bottom:4px;">Your order is on the way!</div>
        <div style="font-size:12px;color:#666;">Expected delivery: <strong style="color:#aaa;">Today</strong></div>
      </td></tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#111;border:1px solid #1e1e1e;border-radius:8px;margin-bottom:24px;">
      <tr>
        <td style="padding:14px 20px;">
          <div style="font-size:9px;letter-spacing:3px;color:#444;text-transform:uppercase;margin-bottom:4px;">Courier</div>
          <div style="font-size:13px;font-weight:700;color:#ccc;">${DEMO_COURIER}</div>
        </td>
        <td style="padding:14px 20px;text-align:right;">
          <div style="font-size:9px;letter-spacing:3px;color:#444;text-transform:uppercase;margin-bottom:4px;">Tracking AWB</div>
          <div style="font-size:13px;font-weight:700;color:#7eb8f7;font-family:monospace;">${DEMO_AWB}</div>
        </td>
      </tr>
    </table>

    <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1200;border:1px solid #3a2a00;border-radius:8px;margin-bottom:24px;">
      <tr><td style="padding:16px 20px;">
        <div style="font-size:9px;font-weight:700;letter-spacing:4px;color:#c9922a;text-transform:uppercase;margin-bottom:6px;">COD — Keep Cash Ready</div>
        <div style="font-size:13px;color:#888;">Please keep <strong style="color:#e8a818;">&#8377;${o.total_price}</strong> ready to hand to the delivery person.</div>
      </td></tr>
    </table>

    ${trackBtn(DEMO_TRACK, 'Track My Order →')}
  </div>

  ${footer()}
</div>
</body></html>`,
  };
}

// ── 3. RETURN / EXCHANGE REQUEST — Admin/Vendor notification ──────────────────
function emailReturnVendor() {
  return {
    subject: `New Return/Exchange Request — ${DEMO_RR_ID} | Order #3037`,
    html: `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f6fa;font-family:Arial,sans-serif;">
<div style="max-width:580px;margin:0 auto;">

  <div style="background:#002eff;padding:32px 36px;">
    <div style="font-size:22px;font-weight:900;color:#fff;letter-spacing:2px;text-transform:uppercase;">New Exchange Request</div>
    <div style="font-size:13px;color:rgba(255,255,255,0.6);margin-top:6px;">A customer has submitted a return/exchange request requiring your review.</div>
  </div>

  <div style="background:#ffffff;padding:32px 36px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:24px;">
      <tr>
        <td style="padding:14px 20px;border-bottom:1px solid #e5e7eb;">
          <div style="font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:2px;margin-bottom:3px;">Request ID</div>
          <div style="font-size:15px;font-weight:700;color:#111;">${DEMO_RR_ID}</div>
        </td>
        <td style="padding:14px 20px;border-bottom:1px solid #e5e7eb;text-align:right;">
          <div style="font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:2px;margin-bottom:3px;">Type</div>
          <div style="font-size:15px;font-weight:700;color:#002eff;">Exchange</div>
        </td>
      </tr>
      <tr>
        <td style="padding:14px 20px;">
          <div style="font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:2px;margin-bottom:3px;">Order</div>
          <div style="font-size:15px;font-weight:700;color:#111;">#3037</div>
        </td>
        <td style="padding:14px 20px;text-align:right;">
          <div style="font-size:10px;color:#9ca3af;text-transform:uppercase;letter-spacing:2px;margin-bottom:3px;">Customer</div>
          <div style="font-size:15px;font-weight:700;color:#111;">Harsh Vijay</div>
        </td>
      </tr>
    </table>

    <div style="font-size:13px;font-weight:600;color:#6b7280;margin-bottom:10px;">Requested Items:</div>
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:20px;">
      <tr>
        <td style="padding:14px 20px;">
          <div style="font-size:13px;font-weight:700;color:#111;">Oversized Tee — Black / L</div>
          <div style="font-size:12px;color:#9ca3af;margin-top:3px;">Reason: Wrong size — wants M</div>
        </td>
        <td style="padding:14px 20px;text-align:right;">
          <div style="font-size:13px;font-weight:700;color:#002eff;">Qty 1</div>
        </td>
      </tr>
    </table>

    <div style="font-size:13px;color:#6b7280;line-height:1.7;margin-bottom:24px;">Log in to your Admin Portal → Returns to approve or reject this request. Customer has been notified that their request is under review.</div>

    <div style="text-align:center;">
      <a href="https://dashboard.croscrow.com/returns?o=3037&contact=na" target="_blank" style="display:inline-block;background:#002eff;color:#fff;font-size:13px;font-weight:800;letter-spacing:2px;text-transform:uppercase;padding:14px 36px;border-radius:4px;text-decoration:none;">Review Request →</a>
    </div>
  </div>

  <div style="background:#f0f4ff;padding:20px 36px;text-align:center;border-top:1px solid #dde3f0;">
    <div style="font-size:11px;color:#9ca3af;line-height:1.8;">&#169; ANTORTIQ &middot; Automated Notification &middot; Powered by Antortiq</div>
  </div>

</div>
</body></html>`,
  };
}

module.exports = { emailShipped, emailOfd, emailReturnVendor, sendDemoEmails };
