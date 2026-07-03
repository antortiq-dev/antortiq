const mongoose = require('mongoose');

const LeadSchema = new mongoose.Schema({
  handle:              { type: String, required: true, unique: true },
  name:                String,
  sector:              String,
  category:            String,
  email:               String,
  phone:               String,
  avatar:              String,
  website:             String,
  followers:           Number,
  status:              { type: String, default: 'new' },
  tags:                [{ type: String }],
  notes:               [{ text: String, createdAt: { type: Date, default: Date.now } }],
  sequence_start_at:   Date,
  proposal_sent_at:    Date,
  followup_1_sent_at:  Date,
  followup_2_sent_at:  Date,
  followup_3_sent_at:  Date,
}, { timestamps: true });

module.exports = mongoose.models.Lead || mongoose.model('Lead', LeadSchema);
