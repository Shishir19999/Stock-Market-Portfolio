// Store for shared/service.js backed by plain objects. Used by the browser-only backend (persisted through
// load/save hooks into localStorage) and by unit tests.
export function createMemoryStore({ load = () => null, save = () => {}, newId } = {}) {
  let counter = 0;
  const makeId = newId || (() => `${Date.now().toString(36)}${(counter += 1).toString(36)}${Math.random().toString(36).slice(2, 7)}`);
  const cache = new Map();
  const state = (uid) => {
    if (!cache.has(uid)) cache.set(uid, load(uid) || {});
    return cache.get(uid);
  };
  const rows = (uid, coll) => {
    const s = state(uid);
    if (!s[coll]) s[coll] = [];
    return s[coll];
  };
  const matches = (doc, filter) => Object.entries(filter || {}).every(([k, v]) => doc[k] === v);
  const clone = (d) => structuredClone(d);
  const commit = (uid) => save(uid, state(uid));
  return {
    async list(coll, uid, filter) {
      return rows(uid, coll).filter((d) => matches(d, filter)).map(clone);
    },
    async insert(coll, uid, doc) {
      const saved = { ...clone(doc), id: makeId() };
      rows(uid, coll).push(saved);
      commit(uid);
      return clone(saved);
    },
    async insertMany(coll, uid, docs) {
      const out = docs.map((d) => ({ ...clone(d), id: makeId() }));
      rows(uid, coll).push(...out);
      commit(uid);
      return out.map(clone);
    },
    async update(coll, uid, id, patch) {
      const doc = rows(uid, coll).find((d) => d.id === id);
      if (!doc) return null;
      Object.assign(doc, clone(patch));
      commit(uid);
      return clone(doc);
    },
    async remove(coll, uid, id) {
      const list = rows(uid, coll);
      const i = list.findIndex((d) => d.id === id);
      if (i < 0) return false;
      list.splice(i, 1);
      commit(uid);
      return true;
    },
    async removeWhere(coll, uid, filter) {
      const s = state(uid);
      s[coll] = rows(uid, coll).filter((d) => !matches(d, filter));
      commit(uid);
    },
    /** Drop cached state for a user (after external storage changes). */
    forget(uid) {
      cache.delete(uid);
    },
    /** Remove every document a user owns. */
    wipe(uid) {
      cache.set(uid, {});
      commit(uid);
    },
  };
}
