const mongoose = require('mongoose');

const BrandSchema = new mongoose.Schema({
  shopId:       { type: String, required: true, unique: true }, // slug e.g. "ctrl-store"
  shopDomain:   { type: String, required: true, unique: true }, // e.g. "ctrl-store.myshopify.com"
  accessToken:  { type: String, required: true },               // shpat_...
  name:         { type: String, required: true },               // display name e.g. "CTRL"
  waNumber:     { type: String, default: '' },                  // brand's WA support number
  razorpayKey:  { type: String, default: '' },                  // brand's Razorpay key_id
  razorpaySecret:{ type: String, default: '' },
  accentColor:  { type: String, default: '#0f0f0f' },
  logoUrl:      { type: String, default: '' },
  webhooksRegistered: { type: Boolean, default: false },
  active:       { type: Boolean, default: true },
  createdAt:    { type: Date, default: Date.now },
});

module.exports = mongoose.models.Brand || mongoose.model('Brand', BrandSchema);
