import { Schema, model, models, type Model, type InferSchemaType, type HydratedDocument } from "mongoose";
import { basePlugin } from "../plugins/base.plugin";
import type { BaseFields } from "../types";

/**
 * One balance per customer, platform-wide — spendable at any vendor, not
 * scoped to whoever issued the credit. `balance` is minor units (cents) so
 * the atomic conditional update below never touches a float.
 *
 * This is the fast-read, authoritative balance. `WalletTxn` below is the
 * append-only audit ledger; the two are kept in sync by `wallet.service`,
 * not by a database transaction (same reasoning as `checkout.service`'s
 * inventory reservation — a transaction needs a replica set a standalone
 * dev mongod may not have).
 */
const walletSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
  balance: { type: Number, default: 0 },
});

walletSchema.plugin(basePlugin);

export type WalletRaw = InferSchemaType<typeof walletSchema> & BaseFields;
export type WalletDoc = HydratedDocument<WalletRaw>;

export const Wallet: Model<WalletRaw> =
  (models.Wallet as Model<WalletRaw>) ?? model<WalletRaw>("Wallet", walletSchema);

export const WALLET_TXN_TYPES = ["credit", "debit"] as const;

const walletTxnSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  type: { type: String, enum: WALLET_TXN_TYPES, required: true },
  /** Minor units, always positive — `type` carries the direction. */
  amount: { type: Number, required: true, min: 0 },
  balanceAfter: { type: Number, required: true },
  reason: { type: String, required: true },
  /** An order id for a checkout debit, or null for a manually issued credit. */
  reference: { type: String, default: null },
  /** Vendor/admin staff who issued a manual credit; null for a checkout debit. */
  issuedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
});

walletTxnSchema.plugin(basePlugin);
walletTxnSchema.index({ user: 1, createdAt: -1 });

export type WalletTxnRaw = InferSchemaType<typeof walletTxnSchema> & BaseFields;
export type WalletTxnDoc = HydratedDocument<WalletTxnRaw>;

export const WalletTxn: Model<WalletTxnRaw> =
  (models.WalletTxn as Model<WalletTxnRaw>) ?? model<WalletTxnRaw>("WalletTxn", walletTxnSchema);
