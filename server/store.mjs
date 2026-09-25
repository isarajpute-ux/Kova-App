/* Storage behind one tiny interface so the router does not care whether it
   is talking to Firebase or to the in-memory map the tests use.

   Everything the server writes lives under /_server in the Realtime
   Database. database.rules.json denies all client access to that subtree;
   the Admin SDK bypasses rules, so only this backend can read it. */

export function memoryStore() {
  const root = {};
  function walk(path, create) {
    const parts = path.split('/').filter(Boolean);
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      if (node[parts[i]] == null || typeof node[parts[i]] !== 'object') {
        if (!create) return [null, null];
        node[parts[i]] = {};
      }
      node = node[parts[i]];
    }
    return [node, parts[parts.length - 1]];
  }
  const clone = v => (v === undefined ? null : JSON.parse(JSON.stringify(v)));
  return {
    async get(path) { const [n, k] = walk(path, false); return n ? clone(n[k]) : null; },
    async set(path, val) {
      const [n, k] = walk(path, true);
      if (val === null || val === undefined) delete n[k]; else n[k] = clone(val);
    },
    async remove(path) { const [n, k] = walk(path, false); if (n) delete n[k]; },
    async incr(path, by = 1) {
      const [n, k] = walk(path, true);
      n[k] = (typeof n[k] === 'number' ? n[k] : 0) + by;
      return n[k];
    },
    _root: root
  };
}

export function firebaseStore(db) {
  return {
    async get(path) { return (await db.ref(path).once('value')).val(); },
    async set(path, val) { await db.ref(path).set(val === undefined ? null : val); },
    async remove(path) { await db.ref(path).remove(); },
    /* transaction, so two concurrent AI calls cannot both read 59 and
       both write 60 under a daily cap of 60 */
    async incr(path, by = 1) {
      const r = await db.ref(path).transaction(v => (typeof v === 'number' ? v : 0) + by);
      return r.snapshot.val();
    }
  };
}

/* RTDB keys cannot contain . # $ [ ] / */
export function safeKey(s) { return String(s).replace(/[.#$\[\]\/]/g, '_'); }
