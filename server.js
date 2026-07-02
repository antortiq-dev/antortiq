require('dotenv').config();
const express = require('express');
const path = require('path');
const contactRoute = require('./routes/contact');
const leadsRoute = require('./routes/leads');
const trackRoute = require('./routes/track');
require('./scheduler');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/contact', contactRoute);
app.use('/api/leads', leadsRoute);
app.use('/api/track', trackRoute);

app.get('/healthz', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`Antortiq web app running on port ${PORT}`);
});
