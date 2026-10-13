const cloudbase = require('@cloudbase/node-sdk')
const { createHandler } = require('./handler.cjs')
const db = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV }).database()
const collection = db.collection('motion_coach_sessions')
exports.main = createHandler({ env: process.env, store: {
  async put(id, data) { await collection.doc(id).set(data) },
  async list(owner, cursor, limit) {
    const query = { owner, ...(cursor ? { _id: db.command.gt(cursor) } : {}) }
    return (await collection.where(query).orderBy('_id','asc').limit(limit).get()).data
  },
} })
