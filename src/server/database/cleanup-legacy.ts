/**
 * Remove data stranded by the Market→Vendor rename.
 * Usage: `npm run db:cleanup-legacy -- --dry`  then without `--dry` to apply.
 *
 * The rename changed the schema field `market` → `vendor`. Documents written
 * before it still carry `market` and have no `vendor`, which makes them
 * invisible: every query in the app is vendor-scoped, so nothing can ever read
 * them. They are not harmless, though — they collided with the stale unique
 * `{market, slug}` index and broke reseeding.
 *
 * Migrating rather than deleting was considered and rejected: the `market` ids
 * point into the old `markets` collection, which the rename also stranded, so a
 * migrated row would reference a vendor that does not exist. These are dev seed
 * artifacts with no downstream value.
 *
 * Also normalises the obsolete `market_admin` role to `vendor`. That string is
 * no longer in the ROLES enum, so a user holding it authorizes as nothing.
 */
import mongoose from "mongoose";
import { connectToDatabase } from "./connection";
import { getRedis } from "@/server/cache/redis";
import { ROLES } from "@/shared/constants/rbac";

const DRY = process.argv.includes("--dry");

/** Vendor-scoped collections that the rename touched. */
const SCOPED = [
  "products",
  "variants",
  "categories",
  "brands",
  "coupons",
  "carts",
  "orders",
  "inventories",
  "memberships",
  "auditlogs",
];

/** Pre-rename: has the old field, lacks the new one. */
const ORPHAN = { market: { $exists: true }, vendor: { $exists: false } };

async function main() {
  await connectToDatabase();
  const db = mongoose.connection.db;
  if (!db) throw new Error("no database handle");

  console.log(`→ ${DRY ? "Inspecting" : "Cleaning"} legacy pre-rename data\n`);

  let total = 0;
  for (const name of SCOPED) {
    const exists = await db.listCollections({ name }).hasNext();
    if (!exists) continue;

    const collection = db.collection(name);
    const count = await collection.countDocuments(ORPHAN);
    if (count === 0) continue;

    total += count;
    if (DRY) {
      console.log(`  ${name.padEnd(14)} would delete ${count}`);
    } else {
      const res = await collection.deleteMany(ORPHAN);
      console.log(`  ${name.padEnd(14)} deleted ${res.deletedCount}`);
    }
  }

  // The `markets` collection itself is dead once its documents are unreachable.
  if (await db.listCollections({ name: "markets" }).hasNext()) {
    const n = await db.collection("markets").countDocuments({});
    total += n;
    if (DRY) console.log(`  ${"markets".padEnd(14)} would drop collection (${n} docs)`);
    else {
      await db.collection("markets").drop();
      console.log(`  ${"markets".padEnd(14)} dropped collection (${n} docs)`);
    }
  }

  // `market_admin` predates the rename and is not a role any more.
  const stale = await db.collection("users").countDocuments({ roles: "market_admin" });
  if (stale > 0) {
    if (DRY) {
      console.log(`  ${"users".padEnd(14)} would rewrite ${stale} × market_admin → ${ROLES.VENDOR}`);
    } else {
      const res = await db
        .collection("users")
        .updateMany({ roles: "market_admin" }, { $set: { "roles.$[old]": ROLES.VENDOR } }, {
          arrayFilters: [{ old: "market_admin" }],
        });
      console.log(`  ${"users".padEnd(14)} rewrote ${res.modifiedCount} × market_admin → ${ROLES.VENDOR}`);
    }
    total += stale;
  }

  console.log(
    total === 0
      ? "\n✓ No legacy data found"
      : `\n✓ ${DRY ? "Would affect" : "Affected"} ${total} document(s)`,
  );
  if (DRY && total > 0) console.log("  Re-run without --dry to apply.");

  await mongoose.disconnect();
  getRedis().disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error("Cleanup failed:", err);
  process.exit(1);
});
