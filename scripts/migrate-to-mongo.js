require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { connect } = require('../db');
const Lead = require('../models/Lead');

async function migrate() {
  await connect();
  const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'leads.json'), 'utf8'));

  let inserted = 0, updated = 0;
  for (const l of raw) {
    const doc = {
      handle: l.handle,
      name: l.name,
      sector: l.sector,
      category: l.category,
      email: l.email || undefined,
      phone: l.phone || undefined,
      avatar: l.avatar || undefined,
      website: l.website || undefined,
      followers: l.followers || undefined,
      status: l.status || 'new',
      proposal_sent_at:   l.proposal_sent_at   ? new Date(l.proposal_sent_at)   : undefined,
      followup_1_sent_at: l.followup_1_sent_at ? new Date(l.followup_1_sent_at) : undefined,
      followup_2_sent_at: l.followup_2_sent_at ? new Date(l.followup_2_sent_at) : undefined,
      followup_3_sent_at: l.followup_3_sent_at ? new Date(l.followup_3_sent_at) : undefined,
    };
    const result = await Lead.findOneAndUpdate({ handle: l.handle }, doc, { upsert: true, new: true });
    if (result.createdAt?.getTime() === result.updatedAt?.getTime()) inserted++; else updated++;
  }

  console.log(`✓ Migration complete — ${inserted} inserted, ${updated} updated`);
  process.exit(0);
}

migrate().catch(err => { console.error(err); process.exit(1); });
