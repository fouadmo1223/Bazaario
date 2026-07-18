/**
 * Reconcile MongoDB's indexes with the current schemas.
 * Usage: `npm run db:sync-indexes`   (add `--dry` to report without changing)
 *
 * Why this exists: Mongoose creates indexes it needs but never drops ones it no
 * longer does. The Market→Vendor rename left 25 orphaned `market_*` indexes
 * behind, six of them unique — and because the `market` field is gone, every
 * document indexed as `market: null`. A unique index on `{market, slug}` then
 * means *one* product may hold a slug across the entire marketplace, which is
 * exactly the opposite of what a multi-vendor catalogue needs. `{market, number}`
 * on orders is worse: per-vendor order numbers restart at 1001, so the second
 * vendor's first order collides with the first vendor's.
 *
 * `syncIndexes()` drops what the schema no longer declares and builds what it
 * does. Run it after any index change.
 */
import mongoose from "mongoose";
import { connectToDatabase } from "./connection";
import * as models from "./models";
import { getRedis } from "@/server/cache/redis";

const DRY = process.argv.includes("--dry");

async function main() {
  await connectToDatabase();
  const db = mongoose.connection.db;
  if (!db) throw new Error("no database handle");

  // Only the surface this script actually touches. Each model is generic over
  // its own document type, so there is no single `Model<T>` that covers them
  // all — and this is a *supertype* of each, which rules out a type predicate
  // (those must narrow, not widen). Mapping to it after the filter is the way.
  type IndexSyncable = {
    collection: { name: string };
    diffIndexes(): Promise<{ toDrop: string[]; toCreate: unknown[] }>;
    syncIndexes(): Promise<string[]>;
  };

  // Every exported Model, found by duck-typing rather than a hand-kept list —
  // a list would drift the moment someone adds a model and forgets this file.
  const entries: [string, IndexSyncable][] = Object.entries(models)
    .filter(([, value]) => typeof (value as { syncIndexes?: unknown })?.syncIndexes === "function")
    .map(([name, value]) => [name, value as unknown as IndexSyncable]);

  console.log(`→ ${DRY ? "Inspecting" : "Syncing"} indexes for ${entries.length} models\n`);

  let dropped = 0;
  for (const [name, model] of entries) {
    const collection = model.collection.name;

    if (DRY) {
      // `diffIndexes` is what `syncIndexes` itself uses, so the preview matches
      // the action. Comparing index keys by hand gets text indexes wrong — Mongo
      // stores them as `{_fts, _ftsx}`, which never equals the schema's
      // `{title: "text", …}` — and would report the search index as an orphan.
      const { toDrop, toCreate } = await model.diffIndexes();
      if (toDrop.length || toCreate.length) {
        console.log(`  ${name} (${collection}):`);
        for (const d of toDrop) console.log(`     would drop    ${d}`);
        for (const c of toCreate) console.log(`     would create  ${JSON.stringify(c)}`);
        dropped += toDrop.length;
      }
      continue;
    }

    try {
      // Returns the names it dropped.
      const removed = await model.syncIndexes();
      if (removed.length) {
        console.log(`  ${name}: dropped ${removed.length} → ${removed.join(", ")}`);
        dropped += removed.length;
      }
    } catch (err) {
      // A collection that doesn't exist yet has nothing to sync.
      console.error(`  ${name}: sync failed —`, (err as Error).message);
    }
  }

  console.log(
    dropped === 0
      ? "\n✓ Indexes already match the schemas"
      : `\n✓ ${DRY ? "Would drop" : "Dropped"} ${dropped} stale index(es)`,
  );

  await mongoose.disconnect();
  getRedis().disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("Index sync failed:", err);
  process.exit(1);
});
