const mongoose = require('mongoose');

const TaskSchema = new mongoose.Schema({
  handle:      String,
  leadName:    String,
  title:       { type: String, required: true },
  description: String,
  priority:    { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  status:      { type: String, enum: ['open', 'done'], default: 'open' },
  dueDate:     Date,
}, { timestamps: true });

TaskSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.models.Task || mongoose.model('Task', TaskSchema);
