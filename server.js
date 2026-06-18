require('dotenv').config();
const express = require('express');
const path = require('path');
const contactRoute = require('./routes/contact');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/contact', contactRoute);

app.get('/healthz', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`Antortiq web app running on port ${PORT}`);
});
