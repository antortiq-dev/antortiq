const mongoose = require('mongoose');

const PixelEventSchema = new mongoose.Schema({
  storeCode:      { type: String, default: '', index: true },
  brandName:      { type: String, default: '' },
  eventName:      { type: String, required: true, index: true },
  productName:    { type: String, default: 'N/A' },
  productImage:   { type: String, default: '' },
  value:          { type: Number, default: null },
  currency:       { type: String, default: '' },
  client_timestamp: { type: String, default: null },
  created_at:     { type: String, default: () => new Date().toISOString(), index: true },
});

PixelEventSchema.index({ created_at: -1 });
PixelEventSchema.index({ eventName: 1, created_at: -1 });
PixelEventSchema.index({ productName: 1, eventName: 1 });
PixelEventSchema.index({ storeCode: 1, created_at: -1 });

module.exports = mongoose.models.PixelEvent || mongoose.model('PixelEvent', PixelEventSchema);
