const express = require('express');
const Lead = require('../models/Lead');
const Task = require('../models/Task');

const router = express.Router();

const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions';

async function askDeepSeek(userMessage, leads) {
  const leadIndex = leads.map(l => `${l.name || l.handle} (handle: ${l.handle}, category: ${l.category || '?'}, tags: [${(l.tags||[]).join(', ')}])`).join('\n');

  const systemPrompt = `You are an AI CRM assistant for Antortiq, a D2C brand operations SaaS startup based in India. Harshit (the founder) will tell you things about leads/brands — observations, intel, follow-up needs, interest signals, competitor tools they use, etc.

Your job is to parse each message and return a JSON response with:
1. A short friendly reply (message)
2. A list of actions to take

Available action types:
- "tag": add tags to a lead (tags should be short kebab-case strings like "uses-return-prime", "interested", "hot-lead", "uses-shopify-plus", "competitor-shiprocket" etc.)
- "note": add a note to a lead's profile
- "task": create a to-do task (with title, description, priority: low/medium/high, optional dueDate as ISO string)
- "status": update a lead's status (new / contacted / interested / not-interested / closed)

Rules:
- Always try to match the brand to a handle from the lead list below
- You can take multiple actions in one response
- If something sounds like a follow-up needed → create a task
- If something sounds like a competitor tool or intel → add a note + tag
- If a brand sounds interested or hot → add "interested" or "hot-lead" tag + update status to "interested"
- Be smart: "1970 seems interested" → tag "interested", status "interested", task "Follow up with 1970 — expressed interest"
- If no lead match found, still create the task/note but leave handle null

LEAD LIST:
${leadIndex}

Respond ONLY with valid JSON in this exact shape:
{
  "message": "...",
  "actions": [
    { "type": "tag", "handle": "...", "tags": ["..."] },
    { "type": "note", "handle": "...", "text": "..." },
    { "type": "task", "handle": "...", "leadName": "...", "title": "...", "description": "...", "priority": "high|medium|low", "dueDate": null },
    { "type": "status", "handle": "...", "status": "interested" }
  ]
}`;

  const res = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) throw new Error(`DeepSeek error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return JSON.parse(data.choices[0].message.content);
}

async function applyActions(actions) {
  const results = [];

  for (const action of actions) {
    try {
      if (action.type === 'tag' && action.handle) {
        const lead = await Lead.findOne({ handle: action.handle });
        if (lead) {
          const newTags = (action.tags || []).filter(t => !lead.tags.includes(t));
          lead.tags.push(...newTags);
          await lead.save();
          results.push({ type: 'tag', handle: action.handle, added: newTags });
        }
      }

      if (action.type === 'note' && action.handle) {
        const lead = await Lead.findOne({ handle: action.handle });
        if (lead) {
          lead.notes.push({ text: action.text, createdAt: new Date() });
          await lead.save();
          results.push({ type: 'note', handle: action.handle });
        }
      }

      if (action.type === 'task') {
        const task = await Task.create({
          handle: action.handle || null,
          leadName: action.leadName || action.handle || null,
          title: action.title,
          description: action.description || '',
          priority: action.priority || 'medium',
          dueDate: action.dueDate ? new Date(action.dueDate) : null,
        });
        results.push({ type: 'task', id: task._id, title: task.title });
      }

      if (action.type === 'status' && action.handle) {
        await Lead.findOneAndUpdate({ handle: action.handle }, { status: action.status });
        results.push({ type: 'status', handle: action.handle, status: action.status });
      }
    } catch (err) {
      results.push({ type: action.type, error: err.message });
    }
  }

  return results;
}

// POST /api/crm/chat
router.post('/chat', async (req, res) => {
  const { message } = req.body || {};
  if (!message?.trim()) return res.status(400).json({ error: 'message required' });

  try {
    const leads = await Lead.find({}, 'handle name category tags').lean();
    const parsed = await askDeepSeek(message, leads);
    const applied = await applyActions(parsed.actions || []);
    res.json({ message: parsed.message, actions: applied });
  } catch (err) {
    console.error('[crm] chat error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/crm/tasks
router.get('/tasks', async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.handle) filter.handle = req.query.handle;
  const tasks = await Task.find(filter).sort({ createdAt: -1 }).lean();
  res.json(tasks);
});

// PATCH /api/crm/tasks/:id
router.patch('/tasks/:id', async (req, res) => {
  const task = await Task.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.json(task);
});

// DELETE /api/crm/tasks/:id
router.delete('/tasks/:id', async (req, res) => {
  await Task.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

// GET /api/crm/notes/:handle
router.get('/notes/:handle', async (req, res) => {
  const lead = await Lead.findOne({ handle: req.params.handle }, 'notes tags').lean();
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  res.json({ notes: lead.notes || [], tags: lead.tags || [] });
});

module.exports = router;
