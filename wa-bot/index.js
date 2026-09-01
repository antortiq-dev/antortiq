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
const { getDemoMessages } = require('./demos');
const { sendDemoEmails } = require('../lib/demo-emails');

// Per-JID pending email capture: jid → 'awaiting_email'
const pendingEmailCapture = new Map();

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

  // ── Pending demo email capture ─────────────────────────────────
  if (pendingEmailCapture.get(jid) === 'awaiting_email') {
    const emailMatch = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
    if (emailMatch) {
      pendingEmailCapture.delete(jid);
      const toEmail = emailMatch[0];
      await sock.sendMessage(jid, { text: `🚀 Sending 3 demo emails to *${toEmail}* right now...` });
      try {
        await sendDemoEmails(toEmail);
        await sock.sendMessage(jid, {
          text: `✅ Done! Check *${toEmail}* — you should have 3 emails:\n\n` +
                `1️⃣ Order Shipped — tracking + AWB\n` +
                `2️⃣ Out for Delivery — COD reminder\n` +
                `3️⃣ Return/Exchange request (vendor view)\n\n` +
                `That's exactly what your customers + team gets — automated, no manual work 🔥\n\n` +
                `Want to see this live on your store? → wa.me/918209544626`,
        });
      } catch (e) {
        console.error('[demo-email] send error:', e.message);
        await sock.sendMessage(jid, { text: `❌ Couldn't send — email address might be wrong. Try again?` });
      }
      return;
    } else {
      await sock.sendMessage(jid, { text: `That doesn't look like an email. Send me your email id — like *yourname@gmail.com*` });
      return;
    }
  }

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

  // ── Global: !sendimg <url> <phone> — send image to a number ──────
  if (text.toLowerCase().startsWith('!sendimg')) {
    const parts = text.trim().split(/\s+/);
    const imgUrl = parts[1] || '';
    const num = (parts[2] || '').replace(/\D/g, '');
    if (!imgUrl || !num) {
      await sock.sendMessage(jid, { text: 'Usage: !sendimg <image-url> <phone-with-country-code>' });
      return;
    }
    const targetJid = `${num}@s.whatsapp.net`;
    await sock.sendMessage(targetJid, { image: { url: imgUrl }, caption: '' });
    await sock.sendMessage(jid, { text: `✅ Image sent to +${num}` });
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
  // Init extra flags if missing
  if (!state.freebieTeased)   state.freebieTeased = false;
  if (!state.demoSent)        state.demoSent = false;
  if (!state.servicesMentioned) state.servicesMentioned = new Set();

  memory.addMessage(jid, 'user', text);
  const scored = memory.scoreMessage(jid, text);
  if (scored > 0) console.log(`  ↑ score ${state.leadScore} (+${scored})`);
  upsertLead(state).catch(() => {});

  // ── Email demo request ─────────────────────────────────────────
  const isEmailDemoRequest = /demo.{0,20}email|email.{0,20}demo|test.{0,20}email|email.{0,20}sample|send.{0,20}email|show.{0,20}email/i.test(text);
  if (isEmailDemoRequest && !pendingEmailCapture.has(jid)) {
    pendingEmailCapture.set(jid, 'awaiting_email');
    setTimeout(() => pendingEmailCapture.delete(jid), 10 * 60 * 1000); // 10min timeout
    await sock.sendMessage(jid, {
      text: `Sure! I'll shoot you 3 live demo emails right now 📧\n\n` +
            `— Order Shipped (with tracking + AWB)\n` +
            `— Out for Delivery (COD reminder)\n` +
            `— Return/Exchange request (vendor view)\n\n` +
            `*Drop your email ID* and they'll land in your inbox in seconds 👇`,
    });
    return;
  }

  // ── Demo request detection ─────────────────────────────────────
  const isDemoRequest = /\b(demo|test message|show me|sample|example|send me one|try it|how does it look|what does it look|can you show)\b/i.test(text);
  if (isDemoRequest) {
    const isWaContext    = /whatsapp|wa\b|whats app/i.test(text) || state.servicesMentioned.has('wa');
    const isEmailContext = /email|mail/i.test(text) || state.servicesMentioned.has('email');
    const { ORDER_CONFIRM, TRACK_SHIPPED, TRACK_OFD } = require('./demos');

    if (isWaContext) {
      // Send WA templates directly
      await sock.sendMessage(jid, { text: '👇 Here\'s exactly what your customers receive on WhatsApp —' });
      for (const m of [ORDER_CONFIRM, TRACK_SHIPPED, TRACK_OFD]) {
        await new Promise(r => setTimeout(r, 1400));
        await sock.sendMessage(jid, { text: m });
      }
      await new Promise(r => setTimeout(r, 1500));
      await sock.sendMessage(jid, { text: `Fully automated — fires the moment your courier updates 🚀\n\nWant this live on your store? → wa.me/918209544626` });
    } else if (isEmailContext) {
      // Trigger email capture flow
      pendingEmailCapture.set(jid, 'awaiting_email');
      setTimeout(() => pendingEmailCapture.delete(jid), 10 * 60 * 1000);
      await sock.sendMessage(jid, {
        text: `Sure! Dropping 3 live demo emails to your inbox 📧\n\nJust send me your *email ID* 👇`,
      });
      return;
    } else {
      // No context — ask which service
      await sock.sendMessage(jid, {
        text: `Sure, I can shoot you a live demo right now! 🚀\n\nWhich would you like?\n\n📱 *WhatsApp* — order confirm, tracking updates, OFD\n📧 *Email* — shipped, out for delivery, return request\n🎯 *Both* — full experience\n\nJust reply with one 👇`,
      });
      return;
    }

    state.demoSent = true;
    if (!state.freebieTeased) {
      await new Promise(r => setTimeout(r, 2000));
      await sock.sendMessage(jid, {
        text: `Oh — and anyone who signs up gets a free add-on 👀\nIt'll change how you handle customer calls forever. Ask me what it is 😄`,
      });
      state.freebieTeased = true;
    }
    return;
  }

  // ── "both" / "whatsapp" / "email" reply after demo prompt ──────
  if (/\bboth\b/i.test(text) && state.demoSent === false) {
    const { ORDER_CONFIRM, TRACK_SHIPPED, TRACK_OFD } = require('./demos');
    await sock.sendMessage(jid, { text: '📱 *WhatsApp demos* — sending now 👇' });
    for (const m of [ORDER_CONFIRM, TRACK_SHIPPED, TRACK_OFD]) {
      await new Promise(r => setTimeout(r, 1400));
      await sock.sendMessage(jid, { text: m });
    }
    await new Promise(r => setTimeout(r, 1000));
    pendingEmailCapture.set(jid, 'awaiting_email');
    setTimeout(() => pendingEmailCapture.delete(jid), 10 * 60 * 1000);
    await sock.sendMessage(jid, { text: `📧 Now drop your *email ID* and I'll shoot the email demos there 👇` });
    state.demoSent = true;
    return;
  }

  await sock.sendPresenceUpdate('composing', jid);
  const reply = await getReply(state.messages, text);
  memory.addMessage(jid, 'assistant', reply);

  const delay = Math.min(800 + reply.length * 8, 2500);
  await new Promise(r => setTimeout(r, delay));
  await sock.sendPresenceUpdate('paused', jid);

  // Send relevant screenshot based on query topic
  const isWaQuery        = /whatsapp|whats app|wa bot|wa integration|wp bot|wp integration/i.test(text);
  const isTrackQuery     = /track|tracking|return|exchange|order page|customer page|post.?purchase/i.test(text);
  const isDashboardQuery = /dashboard|analytics|admin panel|crm|reports?|insights?|orders? panel/i.test(text);
  const isEmailQuery     = /email|pitch email|email marketing|mail|newsletter/i.test(text);
  const isFreebieQuery   = /free|freebie|free.?add.?on|bonus|what.?s free|gift|extra|surprise|what is it|tell me/i.test(text);

  // Track which services this customer has shown interest in
  if (isWaQuery)        state.servicesMentioned.add('wa');
  if (isTrackQuery)     state.servicesMentioned.add('track');
  if (isDashboardQuery) state.servicesMentioned.add('dashboard');
  if (isEmailQuery)     state.servicesMentioned.add('email');

  const FREEBIE_CAPTION =
    `🎁 *Free Add-on: Auto Contact Saver*\n\n` +
    `Every time someone places an order, their number gets auto-saved on your phone as *Harsh #2076* 📲\n\n` +
    `Next time they call — you already know it's Harsh, order #2076. You pick up and say _"Hey Harsh, how can I help?"_ instead of _"hello who is this?"_\n\n` +
    `Small feature. Big impression. And it's completely free when you take any 2 services 🙌\n\n` +
    `Ready to get started? → wa.me/918209544626`;

  if (isFreebieQuery) {
    await sock.sendMessage(jid, { image: { url: 'https://i.ibb.co/v4Y4Nnrz/antortiq-ads-5.png' }, caption: FREEBIE_CAPTION });
  } else if (isWaQuery) {
    await sock.sendMessage(jid, { image: { url: 'https://i.ibb.co/1cFVTXJ/2.png' }, caption: reply });
    // Directly send WA demo templates — no need to ask for demo
    const { ORDER_CONFIRM, TRACK_SHIPPED, TRACK_OFD } = require('./demos');
    for (const m of [ORDER_CONFIRM, TRACK_SHIPPED, TRACK_OFD]) {
      await new Promise(r => setTimeout(r, 1400));
      await sock.sendMessage(jid, { text: m });
    }
  } else if (isTrackQuery) {
    await sock.sendMessage(jid, { image: { url: 'https://i.ibb.co/6c3pynwN/antortiq-ads-2.png' }, caption: reply });
  } else if (isDashboardQuery) {
    await sock.sendMessage(jid, { image: { url: 'https://i.ibb.co/wNTY2BqT/antortiq-ads-3.png' }, caption: reply });
  } else if (isEmailQuery) {
    await sock.sendMessage(jid, { image: { url: 'https://i.ibb.co/whwCKV3V/antortiq-ads-4.png' }, caption: reply });
  } else {
    await sock.sendMessage(jid, { text: reply }, { quoted: msg });
  }
  console.log(`  ↩ replied (${reply.length}c)`);

  // ── Smart freebie tease — fires after first service interest (once per customer) ──
  if (!state.freebieTeased && state.servicesMentioned.size >= 1 && !isFreebieQuery) {
    state.freebieTeased = true;
    await new Promise(r => setTimeout(r, 2500));
    const svc = [...state.servicesMentioned][0];
    const svcLabel = { wa: 'WhatsApp automation', track: 'tracking + returns page', dashboard: 'dashboard', email: 'email system' }[svc] || 'this';
    await sock.sendMessage(jid, {
      text: `Oh — crazy thing btw 👀\n\nIf you go for *${svcLabel}* + any 1 other service, you get a *free add-on* from us.\n\nAsk me what it is 😄`,
    });
  }

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
