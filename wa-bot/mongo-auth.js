/**
 * Baileys auth state backed by MongoDB.
 * Replaces useMultiFileAuthState — session survives Render redeploys.
 */
const { initAuthCreds, BufferJSON, proto } = require('@whiskeysockets/baileys');
const mongoose = require('mongoose');

const authSchema = new mongoose.Schema({
  _id:  { type: String }, // 'creds' or 'key-<id>'
  data: { type: String }, // JSON stringified
}, { strict: false });

let AuthDoc;
function getModel() {
  if (!AuthDoc) AuthDoc = mongoose.models.WaBotAuth || mongoose.model('WaBotAuth', authSchema);
  return AuthDoc;
}

async function useMongoAuthState() {
  const Model = getModel();

  async function readData(id) {
    try {
      const doc = await Model.findById(id).lean();
      if (!doc) return null;
      return JSON.parse(doc.data, BufferJSON.reviver);
    } catch { return null; }
  }

  async function writeData(id, value) {
    try {
      await Model.findByIdAndUpdate(
        id,
        { data: JSON.stringify(value, BufferJSON.replacer) },
        { upsert: true }
      );
    } catch (e) { console.warn('[mongo-auth] write error:', e.message); }
  }

  async function removeData(id) {
    try { await Model.findByIdAndDelete(id); } catch {}
  }

  const creds = (await readData('creds')) || initAuthCreds();

  const state = {
    creds,
    keys: {
      get: async (type, ids) => {
        const data = {};
        await Promise.all(ids.map(async id => {
          let value = await readData(`key-${type}-${id}`);
          if (type === 'app-state-sync-key' && value) {
            value = proto.Message.AppStateSyncKeyData.fromObject(value);
          }
          data[id] = value;
        }));
        return data;
      },
      set: async (data) => {
        const tasks = [];
        for (const category of Object.keys(data)) {
          for (const id of Object.keys(data[category])) {
            const value = data[category][id];
            const key = `key-${category}-${id}`;
            tasks.push(value ? writeData(key, value) : removeData(key));
          }
        }
        await Promise.all(tasks);
      },
    },
  };

  const saveCreds = () => writeData('creds', state.creds);

  return { state, saveCreds };
}

module.exports = { useMongoAuthState };
