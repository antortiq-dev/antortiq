const mongoose = require('mongoose');

let connected = false;

async function connect() {
  if (connected) return;
  await mongoose.connect(process.env.MONGO_URI);
  connected = true;
  console.log('[db] Connected to MongoDB');
}

mongoose.connection.on('error', err => console.error('[db] Error:', err));

module.exports = { connect };
