# Antortiq WA Bot

WhatsApp AI sales + support agent using Baileys (no WhatsApp Business API needed — just scan a QR).

## Setup

```bash
cd wa-bot
npm install
cp .env.example .env
# fill in DEEPSEEK_API_KEY and ADMIN_WA_NUMBER in .env
node index.js
```

Scan the QR code that appears in terminal with WhatsApp → Settings → Linked Devices → Link a Device.

Once connected, the bot stays online. Auth is saved in `wa-bot/auth/` — next start needs no scan.

## How it works

1. Someone messages the connected WA number (from a Meta ad, referral, etc.)
2. Bot replies as "Riya from Antortiq" — qualifies lead, answers service questions, handles objections
3. Every message is scored. Signals like "how much does it cost" (+20), "ready to start" (+35), "I'm the founder" (+15) add to lead score
4. When score hits 60+, or urgency keywords detected → admin gets a WA alert with:
   - Contact name + number
   - Lead score breakdown
   - Last 6 messages of conversation
5. Bot also tells the lead "someone from our team will reach out shortly"
6. Every 4 hours: digest of all active conversations sent to admin

## Admin commands (send to the bot from your number)
- `!status` — live snapshot of all active leads by stage
- `!help` — command list

## Lead scoring
| Signal | Points |
|--------|--------|
| Mentions store/brand | +10 |
| Mentions order volume | +15 |
| Asks about pricing | +20 |
| Interest signal | +15 |
| Ready to start / urgency | +35 |
| Budget confirmed | +25 |
| Decision maker signal | +15 |
| Running Meta ads | +10 |
| Mentions competitor tool | +12 |
| 5+ messages in convo | +10 |

**Escalation threshold: 60 points** or any urgency keyword.

## Files
- `index.js` — Baileys connection, message router, admin commands
- `ai.js` — DeepSeek API client, system prompt with Riya persona
- `knowledge.js` — Full Antortiq knowledge base (services, pricing, objections)
- `memory.js` — Per-contact conversation history + lead scoring
- `escalation.js` — Admin alert formatting + digest
- `leads.js` — MongoDB persistence (optional)
