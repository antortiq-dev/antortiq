const express = require('express');
const router = express.Router();

// botState is set after server starts — imported lazily to avoid circular dep
function getState() {
  try { return require('../wa-bot/index').botState; } catch { return null; }
}

// Simple auth — basic password to protect QR page from public
const QR_PASSWORD = process.env.WA_QR_PASSWORD || 'antortiq2024';

// GET /wa-qr — browser page to scan QR
router.get('/wa-qr', (req, res) => {
  if (req.query.pw !== QR_PASSWORD) {
    return res.send(`
      <html><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;background:#111">
      <form style="background:#1a1a1a;padding:32px;border-radius:16px;display:flex;flex-direction:column;gap:12px">
        <div style="color:#e8344a;font-size:20px;font-weight:800">🤖 Antortiq Bot</div>
        <input name="pw" type="password" placeholder="Password" style="padding:10px;border-radius:8px;border:1px solid #333;background:#111;color:#fff;font-size:14px">
        <button type="submit" style="background:#e8344a;color:#fff;border:none;padding:10px;border-radius:8px;font-weight:700;cursor:pointer">Enter</button>
      </form></body></html>`);
  }

  const state = getState();
  if (!state) {
    return res.send(page('Bot not initialised', '<p style="color:#f59e0b">Bot module not loaded. Check server logs.</p>'));
  }

  if (state.status === 'connected') {
    return res.send(page('Connected ✅', `
      <div style="color:#22c55e;font-size:48px;margin-bottom:16px">✅</div>
      <div style="font-size:20px;font-weight:700;color:#fff">WhatsApp Connected</div>
      <div style="color:#6b7280;margin-top:8px">Bot is live and handling messages.</div>
      <div style="color:#6b7280;font-size:13px;margin-top:4px">Connected since: ${state.startedAt?.toLocaleString() || 'unknown'}</div>
      <div style="margin-top:24px;background:#1a1a1a;border-radius:12px;padding:16px;text-align:left">
        <div style="color:#9ca3af;font-size:12px;margin-bottom:8px">Admin commands (send from your WA):</div>
        <code style="color:#22c55e">!status</code> — live lead digest<br>
        <code style="color:#22c55e">!help</code> — all commands
      </div>
      <meta http-equiv="refresh" content="30">`));
  }

  if (state.status === 'qr_ready' && state.qrDataUrl) {
    return res.send(page('Scan QR Code', `
      <div style="font-size:17px;font-weight:700;color:#fff;margin-bottom:4px">Scan with WhatsApp</div>
      <div style="color:#6b7280;font-size:13px;margin-bottom:20px">Settings → Linked Devices → Link a Device</div>
      <img src="${state.qrDataUrl}" style="width:280px;height:280px;border-radius:12px;border:3px solid #e8344a">
      <div style="color:#6b7280;font-size:12px;margin-top:12px">QR refreshes every 60s — page auto-reloads</div>
      <meta http-equiv="refresh" content="20">`));
  }

  const statusMsg = {
    connecting:   'Starting bot...',
    reconnecting: 'Reconnecting...',
    disconnected: 'Disconnected — check server logs',
    error:        `Error: ${state.error}`,
  }[state.status] || state.status;

  return res.send(page('Connecting...', `
    <div style="color:#f59e0b;font-size:32px;margin-bottom:12px">⏳</div>
    <div style="color:#fff;font-weight:700">${statusMsg}</div>
    <div style="color:#6b7280;font-size:13px;margin-top:8px">Page refreshes automatically</div>
    <meta http-equiv="refresh" content="5">`));
});

function page(title, body) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Antortiq Bot — ${title}</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:system-ui,sans-serif;background:#080808;display:flex;align-items:center;justify-content:center;min-height:100vh}
.card{background:#111;border:1px solid #1e1e22;border-radius:20px;padding:40px;text-align:center;max-width:400px;width:90%}
.logo{font-size:22px;font-weight:800;color:#fff;margin-bottom:32px}
.logo span{color:#e8344a}</style>
</head><body><div class="card">
<div class="logo">Antorti<span>q</span> Bot</div>
${body}
</div></body></html>`;
}

module.exports = router;
