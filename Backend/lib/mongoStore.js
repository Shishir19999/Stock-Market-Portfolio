// Mongo-backed store for shared/service.js (see that file for the interface).
import mongoose from 'mongoose';
import { OWNED } from './models.js';

const plain = (d) => {
  if (!d) return null;
  const { _id, __v, userId, ...rest } = d;
  const out = { id: String(_id), ...rest };
  for (const k of Object.keys(out)) if (out[k] === undefined) delete out[k];
  return out;
};
const valid = (id) => typeof id === 'string' && mongoose.isValidObjectId(id);
// Keep only schema fields so callers cannot write arbitrary keys.
const safeFilter = (filter = {}) => Object.fromEntries(Object.entries(filter).filter(([, v]) => ['string', 'boolean', 'number'].includes(typeof v)));

export function createMongoStore() {
  return {
    async list(coll, uid, filter) {
      return (await OWNED[coll].find({ userId: uid, ...safeFilter(filter) }).sort({ _id: 1 }).lean()).map(plain);
    },
    async insert(coll, uid, doc) {
      const { id: _ignored, ...rest } = doc;
      return plain((await OWNED[coll].create({ ...rest, userId: uid })).toObject());
    },
    async insertMany(coll, uid, docs) {
      const res = await OWNED[coll].insertMany(docs.map(({ id: _i, ...d }) => ({ ...d, userId: uid })));
      return res.map((d) => plain(d.toObject()));
    },
    async update(coll, uid, id, patch) {
      if (!valid(id)) return null;
      const { id: _i, ...rest } = patch;
      return plain(await OWNED[coll].findOneAndUpdate({ _id: id, userId: uid }, { $set: rest }, { returnDocument: 'after', lean: true }));
    },
    async remove(coll, uid, id) {
      if (!valid(id)) return false;
      return (await OWNED[coll].deleteOne({ _id: id, userId: uid })).deletedCount > 0;
    },
    async removeWhere(coll, uid, filter) {
      await OWNED[coll].deleteMany({ userId: uid, ...safeFilter(filter) });
    },
  };
}
