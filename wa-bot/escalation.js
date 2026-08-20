const { getState, getConversationSummary } = require('./memory');

const ADMIN_JID = () => {
  const num = (process.env.ADMIN_WA_NUMBER || '919079060327').replace(/\D/g, '');
  return `${num}@s.whatsapp.net`;
};

// Format a rich admin alert message
function buildAlertMessage(jid, triggerReason) {
  const state = getState(jid);
  if (!state) return null;

  const score = state.leadScore;
  const stage = state.stage.toUpperCase();
  const heat = score >= 80 ? '🔥🔥 VERY HOT' : score >= 60 ? '🔥 HOT LEAD' : '⚡ URGENT';
  const breakdown = state.scoreBreakdown.map(b => `• ${b.label} (+${b.points})`).join('\n');
  const summary = getConversationSummary(jid);
  const phone = jid.replace('@s.whatsapp.net', '').replace('@c.us', '');
  const elapsed = Math.round((Date.now() - state.firstContactAt.getTime()) / 60000);

  return `${heat} — Antortiq Bot Alert
━━━━━━━━━━━━━━━━━━━━━
👤 *Name:* ${state.name || 'Unknown'}
📱 *Number:* +${phone}
⏱ *In conversation:* ${elapsed} min
💬 *Messages:* ${state.messageCount}
📊 *Lead Score:* ${score}/100 (${stage})

🎯 *Trigger:* ${triggerReason}

*Why they scored high:*
${breakdown || '• No specific signals yet'}

━━━━━━━━━━━━━━━━━━━━━
*Last 6 messages:*
${summary}
━━━━━━━━━━━━━━━━━━━━━
Reply to this message or ping them directly: wa.me/${phone}`;
}

async function sendAdminAlert(sock, jid, triggerReason) {
  try {
    const msg = buildAlertMessage(jid, triggerReason);
    if (!msg) return;
    const adminJid = ADMIN_JID();
    await sock.sendMessage(adminJid, { text: msg });
    console.log(`[escalation] Admin alerted for ${jid} — reason: ${triggerReason}`);
  } catch (err) {
    console.error('[escalation] Failed to send admin alert:', err.message);
  }
}

// Periodic digest — every 4 hours, send list of active conversations
async function sendDailyDigest(sock, activeLeads) {
  if (!activeLeads.length) return;
  try {
    const adminJid = ADMIN_JID();
    const hot = activeLeads.filter(l => l.stage === 'hot' || l.stage === 'escalated');
    const qualified = activeLeads.filter(l => l.stage === 'qualified');
    const engaged = activeLeads.filter(l => l.stage === 'engaged');

    const lines = [
      `📊 *Antortiq Bot — Lead Digest*`,
      `━━━━━━━━━━━━━━━━━━━━━`,
      `🔥 Hot/Escalated: ${hot.length}`,
      ...hot.map(l => `  • ${l.name || 'Unknown'} (+${l.jid.slice(0,10)}…) — score ${l.leadScore}`),
      ``,
      `⚡ Qualified: ${qualified.length}`,
      ...qualified.map(l => `  • ${l.name || 'Unknown'} — score ${l.leadScore}`),
      ``,
      `💬 Engaged: ${engaged.length}`,
      `Total active conversations: ${activeLeads.length}`,
    ];
    await sock.sendMessage(adminJid, { text: lines.join('\n') });
  } catch (err) {
    console.error('[escalation] Digest failed:', err.message);
  }
}

module.exports = { sendAdminAlert, sendDailyDigest };
