const mongoose = require('mongoose');

let connected = false;

async function connect() {
  if (connected) return;
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI not set');
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 8000 });
  connected = true;
  console.log('[db] Connected to MongoDB');
}

mongoose.connection.on('error', err => console.error('[db] Error:', err));

module.exports = { connect };
