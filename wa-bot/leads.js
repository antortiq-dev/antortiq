// Lead persistence to MongoDB (optional — bot works without it)
let Lead;
try {
  const mongoose = require('mongoose');
  const leadSchema = new mongoose.Schema({
    jid:            { type: String, index: true, unique: true },
    name:           String,
    phone:          String,
    stage:          { type: String, default: 'new' },
    leadScore:      { type: Number, default: 0 },
    scoreBreakdown: [{ key: String, label: String, points: Number, at: Date }],
    interests:      [String],
    metadata:       {
      orderVolume:  String,
      rtoRate:      String,
      platform:     String,
      storeName:    String,
      currentTools: [String],
    },
    messageCount:   { type: Number, default: 0 },
    escalated:      { type: Boolean, default: false },
    firstContactAt: { type: Date, default: Date.now },
    lastActivityAt: { type: Date, default: Date.now },
  }, { timestamps: true });
  Lead = mongoose.model('WaLead', leadSchema);
} catch (e) {
  console.warn('[leads] MongoDB not available — leads won\'t be persisted');
}

async function upsertLead(state) {
  if (!Lead) return;
  try {
    await Lead.findOneAndUpdate(
      { jid: state.jid },
      {
        name: state.name,
        phone: state.jid.replace('@s.whatsapp.net','').replace('@c.us',''),
        stage: state.stage,
        leadScore: state.leadScore,
        scoreBreakdown: state.scoreBreakdown,
        interests: state.interests,
        metadata: state.metadata,
        messageCount: state.messageCount,
        escalated: state.escalated,
        firstContactAt: state.firstContactAt,
        lastActivityAt: state.lastActivityAt,
      },
      { upsert: true, new: true }
    );
  } catch (e) {
    console.warn('[leads] upsert error:', e.message);
  }
}

async function getHotLeads() {
  if (!Lead) return [];
  return Lead.find({ stage: { $in: ['hot', 'escalated'] } }).sort({ leadScore: -1 }).limit(20);
}

module.exports = { upsertLead, getHotLeads };
