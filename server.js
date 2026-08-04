require('dotenv').config();
const express = require('express');
const path = require('path');
const { connect } = require('./db');
const contactRoute = require('./routes/contact');
const leadsRoute = require('./routes/leads');
const trackRoute = require('./routes/track');
const crmRoute = require('./routes/crm');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/contact', contactRoute);
app.use('/api/leads', leadsRoute);
app.use('/api/track', trackRoute);
app.use('/api/crm', crmRoute);

app.get('/healthz', (req, res) => res.json({ status: 'ok' }));

// Proxy demo login to JARVIS — avoids cross-origin fetch from browser
app.post('/api/demo-login', async (req, res) => {
  const JARVIS = process.env.JARVIS_URL || 'http://localhost:3001';
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
  require('./scheduler');
  app.listen(PORT, () => console.log(`Antortiq web app running on port ${PORT}`));
}).catch(err => { console.error('DB connection failed:', err); process.exit(1); });
