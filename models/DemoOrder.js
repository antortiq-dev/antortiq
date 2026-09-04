const mongoose = require('mongoose');

const DemoOrderSchema = new mongoose.Schema({
  shopifyId:     { type: String, required: true, index: true },
  orderName:     { type: String, default: '' },
  stage:         { type: String, default: 'new', index: true },
  paymentType:   { type: String, default: 'cod' },
  advancePaid:   { type: Number, default: 0 },
  myRevenue:     { type: Number, default: 0 },
  vendorName:    { type: String, default: '', index: true },
  commissionPct: { type: Number, default: 20 },
  awb:           { type: String, default: '' },
  courier:       { type: String, default: '' },
  productName:   { type: String, default: '' },
  customerName:  { type: String, default: '' },
  customerPhone: { type: String, default: '' },
  createdAt:     { type: Date, default: Date.now, index: true },
  updatedAt:     { type: Date, default: Date.now },
});

DemoOrderSchema.index({ createdAt: -1 });
DemoOrderSchema.index({ stage: 1, createdAt: -1 });
DemoOrderSchema.index({ vendorName: 1, createdAt: -1 });

module.exports = mongoose.models.DemoOrder || mongoose.model('DemoOrder', DemoOrderSchema);
