require('dotenv').config();
const express = require('express');
const path = require('path');
const { connect } = require('./db');
const contactRoute = require('./routes/contact');
const leadsRoute = require('./routes/leads');
const trackRoute = require('./routes/track');
const crmRoute = require('./routes/crm');
const cdcRoute = require('./routes/cdc');
const wabotRoute = require('./routes/wabot');
const brandsRoute = require('./routes/brands');
const webhooksRoute = require('./routes/webhooks');
const orderRoute = require('./routes/order');
const mailerRoute = require('./routes/mailer');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/brands', brandsRoute);
app.use('/api/mail', mailerRoute);
app.use('/webhooks', webhooksRoute);
app.use('/order', orderRoute);
app.use('/api/contact', contactRoute);
app.use('/api/leads', leadsRoute);
app.use('/api/track', trackRoute);
app.use('/api/crm', crmRoute);
app.use('/api/cdc', cdcRoute);
app.use('/', wabotRoute);

app.get('/healthz', (req, res) => res.json({ status: 'ok' }));

// Proxy demo login to JARVIS — avoids cross-origin fetch from browser
app.post('/api/demo-login', async (req, res) => {
  const JARVIS = process.env.JARVIS_URL || 'https://autoaijarvis1.onrender.com';
  try {
    const r = await fetch(`${JARVIS}/demo/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (e) {
    res.status(502).json({ error: 'Could not reach auth server' });
  }
});

connect().then(() => {
  try { require('./scheduler'); } catch(e) { console.warn('Scheduler failed to load:', e.message); }
  // Start WA bot after DB is ready (needs MongoDB auth state)
  try {
    const { startBot } = require('./wa-bot/index');
    startBot().catch(e => console.warn('[wa-bot] Start error:', e.message));
  } catch(e) { console.warn('[wa-bot] Failed to load:', e.message); }
  app.listen(PORT, () => console.log(`Antortiq running on port ${PORT}`));
}).catch(err => {
  console.warn('DB connection failed — starting without DB:', err.message);
  app.listen(PORT, () => console.log(`Antortiq running on port ${PORT} (no DB)`));
});
