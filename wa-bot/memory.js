// Per-contact conversation memory + lead scoring
const conversations = new Map(); // jid → ConversationState

const LEAD_SCORE_RULES = {
  store_mention:    { pattern: /shopify|store|brand|shop|website/i,      points: 10, label: 'Mentioned store' },
  order_volume:     { pattern: /orders?\s*(per|\/|a)\s*(month|day|week)|orders?\s*monthly|\d{2,4}\s*orders?/i, points: 15, label: 'Mentioned order volume' },
  rto_problem:      { pattern: /rto|return to origin|fake order|cod problem|undelivered/i, points: 12, label: 'RTO pain' },
  pricing_ask:      { pattern: /how much|price|cost|pricing|rate|charges?|fee|₹|rupee/i, points: 20, label: 'Asked about pricing' },
  interest_signal:  { pattern: /interest(ed)?|sound(s)? good|tell me more|want to|would like|can you|how do i/i, points: 15, label: 'Interest signal' },
  ready_to_buy:     { pattern: /ready|let('s| us) (start|go|do it)|when can (you|we)|asap|urgent|today|this week|set it up|go ahead|proceed/i, points: 35, label: 'Ready to start' },
  budget_confirmed: { pattern: /budget|we have funds|can pay|payment|advance|invoice/i, points: 25, label: 'Budget confirmed' },
  decision_maker:   { pattern: /i('m| am) (the |a )?founder|owner|ceo|co-founder|director|my (brand|store|business)/i, points: 15, label: 'Decision maker' },
  meta_ads:         { pattern: /meta|facebook|instagram ads|roas|cpm|cpp|campaign/i, points: 10, label: 'Running Meta ads' },
  competitor_named: { pattern: /shiprocket|delhivery|returnprime|interakt|wati|gorgias|freshdesk|klaviyo|unicommerce/i, points: 12, label: 'Using competitor tool' },
};

const URGENCY_KEYWORDS = [
  'urgent', 'asap', 'emergency', 'immediately', 'right now', 'today', 'by tonight',
  'losing money', 'too many rtOs', 'rto is killing', 'please help', 'need this now',
  'ready to pay', 'ready to start', 'when can we start', 'let\'s proceed', 'go ahead'
];

function getOrCreate(jid, name) {
  if (!conversations.has(jid)) {
    conversations.set(jid, {
      jid,
      name: name || null,
      messages: [],           // [{role, content}] for DeepSeek
      leadScore: 0,
      scoreBreakdown: [],
      stage: 'new',           // new → engaged → qualified → hot → escalated
      interests: [],          // detected service interests
      metadata: {
        orderVolume: null,
        rtoRate: null,
        platform: null,
        storeName: null,
        currentTools: [],
      },
      firstContactAt: new Date(),
      lastActivityAt: new Date(),
      messageCount: 0,
      escalated: false,
      escalationCount: 0,
    });
  }
  const state = conversations.get(jid);
  state.lastActivityAt = new Date();
  if (name && !state.name) state.name = name;
  return state;
}

function addMessage(jid, role, content) {
  const state = conversations.get(jid);
  if (!state) return;
  state.messages.push({ role, content });
  state.messageCount++;
  // Keep last 30 messages to avoid token overflow
  if (state.messages.length > 30) state.messages = state.messages.slice(-30);
}

function scoreMessage(jid, text) {
  const state = conversations.get(jid);
  if (!state) return 0;

  let gained = 0;
  for (const [key, rule] of Object.entries(LEAD_SCORE_RULES)) {
    // Don't double-score the same signal
    if (state.scoreBreakdown.some(b => b.key === key)) continue;
    if (rule.pattern.test(text)) {
      state.leadScore += rule.points;
      gained += rule.points;
      state.scoreBreakdown.push({ key, label: rule.label, points: rule.points, at: new Date() });
    }
  }

  // Engagement score — 5 messages = moderate lead
  if (state.messageCount === 5 && !state.scoreBreakdown.some(b => b.key === 'engaged')) {
    state.leadScore += 10;
    gained += 10;
    state.scoreBreakdown.push({ key: 'engaged', label: '5+ message conversation', points: 10, at: new Date() });
  }

  // Update stage
  if (state.leadScore >= 60) state.stage = 'hot';
  else if (state.leadScore >= 35) state.stage = 'qualified';
  else if (state.leadScore >= 15) state.stage = 'engaged';

  return gained;
}

function isUrgent(text) {
  const lower = text.toLowerCase();
  return URGENCY_KEYWORDS.some(kw => lower.includes(kw));
}

function shouldEscalate(jid, text) {
  const state = conversations.get(jid);
  if (!state || state.escalated) return false;
  return state.leadScore >= 60 || isUrgent(text);
}

function markEscalated(jid) {
  const state = conversations.get(jid);
  if (state) { state.escalated = true; state.stage = 'escalated'; state.escalationCount++; }
}

function getConversationSummary(jid) {
  const state = conversations.get(jid);
  if (!state) return '';
  // Return last 6 messages for context in admin alert
  return state.messages.slice(-6).map(m => `${m.role === 'user' ? '👤' : '🤖'} ${m.content}`).join('\n');
}

function getState(jid) { return conversations.get(jid); }

function getAllActive() {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000; // last 24h
  return [...conversations.values()].filter(s => s.lastActivityAt.getTime() > cutoff);
}

module.exports = { getOrCreate, addMessage, scoreMessage, shouldEscalate, markEscalated, getConversationSummary, getState, getAllActive, isUrgent };
