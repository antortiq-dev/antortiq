const mongoose = require('mongoose');

const ProposalSchema = new mongoose.Schema({
  slug: { type: String, unique: true, required: true },
  clientName: String,
  contactPerson: String,
  email: String,
  phone: String,
  website: String,
  industry: String,
  customMsg: String,
  preparedBy: String,
  validDays: { type: Number, default: 7 },
  timeline: String,
  support: String,
  services: Array,
  totalPrice: Number,
  createdAt: { type: Date, default: Date.now },
  expiresAt: Date,
  viewCount: { type: Number, default: 0 },
  firstViewedAt: Date,
  lastViewedAt: Date,
});

module.exports = mongoose.models.Proposal || mongoose.model('Proposal', ProposalSchema);
