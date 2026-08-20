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

const logger = pino({ level: 'silent' });

const ADMIN_NUMBER = (process.env.ADMIN_WA_NUMBER || '918209544626').replace(/\D/g, '');

// Shared state — exported so Express route can read QR + status
const botState = {
  status: 'disconnected', // disconnected | qr_ready | connected
  qrDataUrl: null,        // base64 PNG for browser display
  qrRaw: null,            // raw string for terminal fallback
  sock: null,
  startedAt: null,
  error: null,
};

const recentReplies = new Map();

async function startBot() {
  botState.status = 'connecting';
  botState.error = null;
  console.log('[wa-bot] Starting...');

  let authState, saveCreds;
  try {
    ({ state: authState, saveCreds } = await useMongoAuthState());
  } catch (err) {
    botState.status = 'error';
    botState.error = 'MongoDB not connected — bot requires DB';
    console.error('[wa-bot] Auth state error:', err.message);
    return;
  }

  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: authState,
    logger,
    printQRInTerminal: false,
    browser: ['Antortiq Bot', 'Chrome', '120.0'],
    generateHighQualityLinkPreview: false,
    syncFullHistory: false,
  });

  botState.sock = sock;

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      botState.status = 'qr_ready';
      botState.qrRaw = qr;
      // Generate base64 PNG for browser
      try {
        const QRCode = require('qrcode');
        botState.qrDataUrl = await QRCode.toDataURL(qr, { width: 320, margin: 2 });
      } catch {
        botState.qrDataUrl = null;
      }
      console.log('[wa-bot] QR ready — visit /wa-qr to scan');
    }

    if (connection === 'open') {
      botState.status = 'connected';
      botState.qrDataUrl = null;
      botState.qrRaw = null;
      botState.startedAt = new Date();
      console.log('[wa-bot] ✅ WhatsApp connected!');
      try {
        await sock.sendMessage(`${ADMIN_NUMBER}@s.whatsapp.net`, {
          text: '🤖 *Antortiq Bot is LIVE*\n\nHandling incoming leads 24/7.\nSend *!status* for live lead digest.',
        });
      } catch (_) {}
    }

    if (connection === 'close') {
      const code = (lastDisconnect?.error instanceof Boom)
        ? lastDisconnect.error.output.statusCode
        : null;
      const shouldReconnect = code !== DisconnectReason.loggedOut;
      botState.status = shouldReconnect ? 'reconnecting' : 'disconnected';
      botState.sock = null;
      console.log(`[wa-bot] Connection closed (${code}). ${shouldReconnect ? 'Reconnecting...' : 'Logged out.'}`);
      if (shouldReconnect) {
        setTimeout(() => startBot(), 5000);
      }
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
  if (msg.key.fromMe) return;
  const jid = msg.key.remoteJid;
  if (!jid || jid.endsWith('@g.us')) return;

  const text = (
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.buttonsResponseMessage?.selectedDisplayText || ''
  ).trim();
  if (!text) return;

  const now = Date.now();
  if (recentReplies.get(jid) > now - 2000) return;
  recentReplies.set(jid, now);

  const isAdmin = jid === `${ADMIN_NUMBER}@s.whatsapp.net`;
  if (isAdmin) { await handleAdminCommand(sock, jid, text); return; }

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
  console.log(`  🤖 replied (${reply.length}c)`);

  const wantsCall = /\b(call|talk|speak|connect|human|real person|call me|hop on|get on a call|schedule a call|want to call|wanna call)\b/i.test(text);
  if (wantsCall && !state.callRequested) {
    state.callRequested = true;
    const phone = jid.replace('@s.whatsapp.net', '').replace('@c.us', '');
    await sendAdminAlert(sock, jid, '📞 Customer asked for a call / real human');
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
      text: "I've flagged your conversation to our team — someone will reach out to you shortly! 👍",
    });
  }
}

async function handleAdminCommand(sock, adminJid, text) {
  const cmd = text.trim().toLowerCase();
  if (cmd === '!status' || cmd === '!digest') {
    const active = memory.getAllActive();
    const hot = active.filter(l => l.stage === 'hot' || l.stage === 'escalated');
    const lines = [
      `📊 *Bot Status — ${new Date().toLocaleTimeString()}*`,
      `━━━━━━━━━━━━━━━━`,
      `Active (24h): ${active.length}`,
      `🔥 Hot/escalated: ${hot.length}`,
      `⚡ Qualified: ${active.filter(l => l.stage === 'qualified').length}`,
      `💬 Engaged: ${active.filter(l => l.stage === 'engaged').length}`,
      ``,
      ...hot.map(l => `🔥 ${l.name || 'Unknown'} +${l.jid.replace('@s.whatsapp.net','')} — score ${l.leadScore}`),
    ];
    await sock.sendMessage(adminJid, { text: lines.join('\n') });
  } else if (cmd === '!help') {
    await sock.sendMessage(adminJid, { text: `*Bot Commands*\n!status — lead digest\n!help — this message` });
  }
}

module.exports = { startBot, botState };
