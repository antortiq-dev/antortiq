require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { default: makeWASocket, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const cron = require('node-cron');

const { useMongoAuthState } = require('./mongo-auth');
const { getReply } = require('./ai');
const memory = require('./memory');
const { upsertLead } = require('./leads');
const { sendAdminAlert, sendDailyDigest } = require('./escalation');
const { sendPitchEmail } = require('../lib/mailer');
const { handleConfirmationResponse } = require('./order-confirm');

const logger = pino({ level: 'silent' });

const ADMIN_NUMBER = (process.env.ADMIN_WA_NUMBER || '918209544626').replace(/\D/g, '');
const ADMIN_JID = `${ADMIN_NUMBER}@s.whatsapp.net`;

// Shared state — exported so Express route can read QR + status
const botState = {
  status: 'disconnected',
  qrDataUrl: null,
  qrRaw: null,
  sock: null,
  startedAt: null,
  error: null,
};

const recentReplies = new Map();

// Track which customer chats admin has manually taken over
const adminHandoff = new Set(); // jids where admin replied manually — Riya stays silent

let isFirstConnect = true; // only send startup ping once ever

async function startBot() {
  botState.status = 'connecting';
  botState.error = null;
  console.log('[wa-bot] Starting...');

  let authState, saveCreds;
  try {
    ({ state: authState, saveCreds } = await useMongoAuthState());
  } catch (err) {
    botState.status = 'error';
    botState.error = 'MongoDB not connected — requires DB';
    console.error('[wa-bot] Auth state error:', err.message);
    return;
  }

  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: authState,
    logger,
    printQRInTerminal: false,
    browser: ['Antortiq', 'Chrome', '120.0'],
    generateHighQualityLinkPreview: false,
    syncFullHistory: false,
  });

  botState.sock = sock;

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      botState.status = 'qr_ready';
      botState.qrRaw = qr;
      try {
        const QRCode = require('qrcode');
        botState.qrDataUrl = await QRCode.toDataURL(qr, { width: 320, margin: 2 });
      } catch { botState.qrDataUrl = null; }
      console.log('[wa-bot] QR ready — visit /wa-qr to scan');
    }

    if (connection === 'open') {
      botState.status = 'connected';
      botState.qrDataUrl = null;
      botState.qrRaw = null;
      botState.startedAt = new Date();
      console.log('[wa-bot] ✅ WhatsApp connected!');

      // Only notify admin on very first connect, not every reconnect
      if (isFirstConnect) {
        isFirstConnect = false;
        try {
          await sock.sendMessage(ADMIN_JID, {
            text: '✅ *Antortiq is live*\n\nHandling incoming queries 24/7.\nSend *!status* for active lead summary.',
          });
        } catch (_) {}
      }
    }

    if (connection === 'close') {
      const code = (lastDisconnect?.error instanceof Boom)
        ? lastDisconnect.error.output.statusCode : null;
      const shouldReconnect = code !== DisconnectReason.loggedOut;
      botState.status = shouldReconnect ? 'reconnecting' : 'disconnected';
      botState.sock = null;
      console.log(`[wa-bot] Connection closed (${code}). ${shouldReconnect ? 'Reconnecting...' : 'Logged out.'}`);
      if (shouldReconnect) setTimeout(() => startBot(), 5000);
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      try { await handleMessage(sock, msg); } catch (e) { console.error('[wa-bot] msg error:', e.message); }
    }
  });

  // Every 4 hours: admin digest
  cron.schedule('0 */4 * * *', async () => {
    const active = memory.getAllActive();
    if (active.length && botState.status === 'connected') {
      await sendDailyDigest(sock, active);
    }
  });
}

async function handleMessage(sock, msg) {
  const jid = msg.key.remoteJid;
  if (!jid || jid.endsWith('@g.us')) return;

  const text = (
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.buttonsResponseMessage?.selectedDisplayText || ''
  ).trim();
  if (!text) return;

  // ── Admin sent a message FROM their phone ──────────────────────
  if (msg.key.fromMe && jid !== ADMIN_JID) {
    // Admin manually replied to a customer chat — hand off that chat
    adminHandoff.add(jid);
    console.log(`[wa-bot] 🤝 Admin took over chat with ${jid} — Riya paused for this contact`);
    return;
  }

  if (msg.key.fromMe) return; // own messages to admin chat, ignore

  const now = Date.now();
  if (recentReplies.get(jid) > now - 2000) return;
  recentReplies.set(jid, now);

  // ── Global dev commands (work from any number) ─────────────────
  if (text.toLowerCase().startsWith('!testconfirm')) {
    const num = text.trim().slice(12).trim().replace(/\D/g, '');
    if (!num) { await sock.sendMessage(jid, { text: 'Send: !testconfirm 916375668971' }); return; }
    const testJid = `${num}@s.whatsapp.net`;
    await sock.sendMessage(testJid, {
      text:
        '🛍️ *Order Confirmation Required*\n\n' +
        '■ CROSCROW ■\n' +
        '━━━━━━━━━━━━━━━━━━━━━━\n' +
        'ORDER   :  #3106\n' +
        'ITEMS   :  MIAMI - CORE 002 - S × 1\n' +
        'TOTAL   :  ₹1,835.00\n' +
        '━━━━━━━━━━━━━━━━━━━━━━\n' +
        'SHIP TO :  raisinghnagar, GANGANAGAR\n\n' +
        'Reply *Y* to confirm ✅\n' +
        'Reply *N* to cancel ❌',
    });
    await sock.sendMessage(jid, { text: `✅ Test sent to +${num}` });
    return;
  }

  // ── Admin commands ─────────────────────────────────────────────
  if (jid === ADMIN_JID) { await handleAdminCommand(sock, jid, text); return; }

  // ── Order confirmation Y/N reply ───────────────────────────────
  const handled = await handleConfirmationResponse(sock, jid, text);
  if (handled) return;

  // ── Customer chat — check if admin has taken over ──────────────
  if (adminHandoff.has(jid)) {
    console.log(`[wa-bot] ⏸ ${jid} is in admin handoff — skipping auto-reply`);
    return;
  }

  const pushName = msg.pushName || null;
  console.log(`[wa-bot] 📩 ${pushName || jid.slice(0,12)}: ${text.slice(0,80)}`);

  const state = memory.getOrCreate(jid, pushName);
  memory.addMessage(jid, 'user', text);
  const scored = memory.scoreMessage(jid, text);
  if (scored > 0) console.log(`  ↑ score ${state.leadScore} (+${scored})`);
  upsertLead(state).catch(() => {});

  await sock.sendPresenceUpdate('composing', jid);
  const reply = await getReply(state.messages, text);
  memory.addMessage(jid, 'assistant', reply);

  const delay = Math.min(800 + reply.length * 8, 2500);
  await new Promise(r => setTimeout(r, delay));
  await sock.sendPresenceUpdate('paused', jid);
  await sock.sendMessage(jid, { text: reply }, { quoted: msg });
  console.log(`  ↩ replied (${reply.length}c)`);

  const wantsCall = /\b(call|talk|speak|connect|human|real person|call me|hop on|get on a call|schedule a call|want to call|wanna call)\b/i.test(text);
  if (wantsCall && !state.callRequested) {
    state.callRequested = true;
    const phone = jid.replace(/@s\.whatsapp\.net|@c\.us|@lid/g, '');
    await sendAdminAlert(sock, jid, '📞 Customer asked to speak to someone');
    upsertLead(state).catch(() => {});
    const adminNum = (process.env.ADMIN_WA_NUMBER || '918209544626').replace(/\D/g, '');
    await new Promise(r => setTimeout(r, 1200));
    await sock.sendMessage(jid, {
      text: `Sure! You can directly reach our founder here 👇\n\n📞 *+${adminNum}*\n\nOr click: wa.me/${adminNum}\n\nThey'll get back to you quickly. Is there a good time that works for you?`,
    });
    return;
  }

  if (memory.shouldEscalate(jid, text)) {
    memory.markEscalated(jid);
    const reason = memory.isUrgent(text) ? 'Urgency keywords detected' : `Lead score ${state.leadScore}`;
    await sendAdminAlert(sock, jid, reason);
    upsertLead(state).catch(() => {});
    await new Promise(r => setTimeout(r, 1500));
    await sock.sendMessage(jid, {
      text: "I've shared your details with our team — someone will reach out to you shortly! 👍",
    });
  }
}

async function handleAdminCommand(sock, adminJid, text) {
  const cmd = text.trim().toLowerCase();

  // !pitch email@x.com — send pitch email to a brand
  if (cmd.startsWith('!pitch')) {
    const email = text.trim().slice(6).trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      await sock.sendMessage(adminJid, { text: `Send: *!pitch brand@example.com*` });
      return;
    }
    try {
      await sock.sendMessage(adminJid, { text: `⏳ Sending pitch email to *${email}*…` });
      await sendPitchEmail(email);
      await sock.sendMessage(adminJid, { text: `✅ Pitch email sent to *${email}*` });
    } catch (e) {
      await sock.sendMessage(adminJid, { text: `❌ Failed: ${e.message}` });
    }
    return;
  }

  // !resume +919876543210 — hand back a chat to Riya
  if (cmd.startsWith('!resume')) {
    const num = cmd.replace('!resume','').trim().replace(/\D/g,'');
    if (num) {
      const targetJid = `${num}@s.whatsapp.net`;
      adminHandoff.delete(targetJid);
      await sock.sendMessage(adminJid, { text: `✅ Resumed auto-reply for +${num}` });
    } else {
      await sock.sendMessage(adminJid, { text: `Send: *!resume 919876543210* (with country code, no +)` });
    }
    return;
  }

  if (cmd === '!status' || cmd === '!digest') {
    const active = memory.getAllActive();
    const hot = active.filter(l => l.stage === 'hot' || l.stage === 'escalated');
    const paused = adminHandoff.size;
    const lines = [
      `📊 *Lead Summary — ${new Date().toLocaleTimeString()}*`,
      `━━━━━━━━━━━━━━━━`,
      `Active (24h): ${active.length}`,
      `🔥 Hot: ${hot.length}`,
      `⚡ Qualified: ${active.filter(l => l.stage === 'qualified').length}`,
      `💬 Engaged: ${active.filter(l => l.stage === 'engaged').length}`,
      `⏸ Admin handling: ${paused}`,
      ``,
      ...hot.map(l => `🔥 ${l.name || 'Unknown'} +${l.jid.replace(/@s\.whatsapp\.net|@c\.us|@lid/g,'')} — score ${l.leadScore}`),
    ];
    await sock.sendMessage(adminJid, { text: lines.join('\n') });
  } else if (cmd === '!help') {
    await sock.sendMessage(adminJid, {
      text: `*Commands*\n!status — lead summary\n!pitch email@brand.com — send pitch email\n!resume 91XXXXXXXXXX — hand chat back to Riya\n!help — this message`,
    });
  }
}

module.exports = { startBot, botState };
