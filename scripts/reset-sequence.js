// Reset all leads to start fresh sequence from tomorrow 12:00 PM IST
require('dotenv').config();
const { connect } = require('../db');
const Lead = require('../models/Lead');

async function run() {
  await connect();

  // Tomorrow 12:00 PM IST = 06:30 UTC
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setUTCHours(6, 30, 0, 0); // 12:00 PM IST

  const result = await Lead.updateMany(
    { email: { $exists: true, $ne: '' } },
    {
      $set:   { sequence_start_at: tomorrow, status: 'new' },
      $unset: { proposal_sent_at: '', followup_1_sent_at: '', followup_2_sent_at: '', followup_3_sent_at: '' },
    }
  );

  console.log(`✓ Reset ${result.modifiedCount} leads`);
  console.log(`  Sequence starts: ${tomorrow.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`);
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
