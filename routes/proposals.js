const express = require('express');
const router = express.Router();
const Proposal = require('../models/Proposal');
const { Resend } = require('resend');

const ADMIN_KEY = process.env.ADMIN_API_KEY || 'antortiq-admin-2025';
const ADMIN_WA  = process.env.ADMIN_WA_NUMBER || '918209544626';

function auth(req, res, next) {
  if (req.headers['x-admin-key'] !== ADMIN_KEY) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

function makeSlug() {
  return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
}

// POST /api/proposals — save and return shareable link
router.post('/', auth, async (req, res) => {
  try {
    const { clientName, contactPerson, email, phone, website, industry,
            customMsg, preparedBy, validDays, timeline, support, services, totalPrice } = req.body;

    const slug = makeSlug();
    const expiresAt = new Date(Date.now() + (Number(validDays) || 7) * 86400000);

    const proposal = await Proposal.create({
      slug, clientName, contactPerson, email, phone, website, industry,
      customMsg, preparedBy, validDays, timeline, support, services, totalPrice, expiresAt,
    });

    const url = `${process.env.APP_URL || 'https://antortiq.onrender.com'}/p/${slug}`;
    res.json({ ok: true, url, slug, id: proposal._id });
  } catch (e) {
    console.error('[proposals] create error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/proposals/:slug — fetch proposal data (client-facing)
router.get('/:slug', async (req, res) => {
  try {
    const proposal = await Proposal.findOne({ slug: req.params.slug });
    if (!proposal) return res.status(404).json({ error: 'Proposal not found' });
    if (proposal.expiresAt && proposal.expiresAt < new Date()) {
      return res.status(410).json({ error: 'Proposal has expired' });
    }

    // Track view
    const isFirstView = proposal.viewCount === 0;
    proposal.viewCount += 1;
    proposal.lastViewedAt = new Date();
    if (isFirstView) proposal.firstViewedAt = new Date();
    await proposal.save();

    // Notify admin on WA for first view
    if (isFirstView) {
      try {
        const { botState } = require('../wa-bot/index');
        if (botState && botState.sock) {
          const name = proposal.clientName || proposal.contactPerson || 'A client';
          await botState.sock.sendMessage(`${ADMIN_WA}@s.whatsapp.net`, {
            text: `👀 *Proposal Opened*\n\n${name} just opened their proposal for the first time.\n\nLink: ${process.env.APP_URL}/p/${proposal.slug}`,
          });
        }
      } catch (_) {}
    }

    res.json({ ok: true, proposal });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/proposals — list all (admin)
router.get('/', auth, async (req, res) => {
  const proposals = await Proposal.find().sort({ createdAt: -1 }).lean();
  res.json(proposals);
});

module.exports = router;
