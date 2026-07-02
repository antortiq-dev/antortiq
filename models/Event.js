const mongoose = require('mongoose');

const EventSchema = new mongoose.Schema({
  type:     { type: String, required: true }, // email_open | email_click | page_visit | wa_click
  handle:   String,
  brand:    String,
  template: String,
  page:     String,
  ref:      String,
  ip:       String,
  ua:       String,
  to:       String,
}, { timestamps: true });

EventSchema.index({ createdAt: -1 });
EventSchema.index({ handle: 1 });
EventSchema.index({ type: 1 });

module.exports = mongoose.models.Event || mongoose.model('Event', EventSchema);
