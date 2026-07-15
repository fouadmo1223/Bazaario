import { connectToDatabase } from "@/server/database/connection";
import { marketRepository } from "@/server/repositories/market.repository";
import { Market, type MarketDoc } from "@/server/database/models/market.model";
import { User } from "@/server/database/models/user.model";
import { Membership } from "@/server/database/models/membership.model";
import { Errors } from "@/shared/lib/errors";
import { ROLES } from "@/shared/constants/rbac";
import { writeAudit } from "./audit.service";
import { logger } from "@/shared/lib/logger";
import { paginationSchema, type Paginated } from "@/shared/lib/pagination";
import { z } from "zod";

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);

export const createMarketSchema = z.object({
  name: z.string().min(2).max(80),
  slug: z.string().min(2).max(60).optional(),
  ownerEmail: z.string().email(),
  currency: z.string().length(3).optional(),
});
export type CreateMarketInput = z.infer<typeof createMarketSchema>;

/**
 * Market lifecycle — Super Admin only (authorization enforced by the caller).
 * Enforces the platform invariant: a market has exactly one owner, and a user
 * may own at most one market.
 */
export const marketService = {
  async create(input: CreateMarketInput, actorId: string): Promise<MarketDoc> {
    await connectToDatabase();

    const owner = await User.findOne({ email: input.ownerEmail });
    if (!owner) throw Errors.notFound("Owner user not found — they must register first");

    // One market per admin.
    const existingOwned = await marketRepository.findByOwner(String(owner._id));
    if (existingOwned) throw Errors.conflict("This user already owns a market");

    const slug = input.slug ? slugify(input.slug) : slugify(input.name);
    if (await marketRepository.findBySlug(slug)) {
      throw Errors.conflict(`Slug "${slug}" is already taken`);
    }

    const market = await Market.create({
      name: input.name,
      slug,
      owner: owner._id,
      status: "active",
      createdBy: actorId,
      settings: input.currency ? { currency: input.currency } : {},
    });

    // Grant the owner the market_admin membership + platform role.
    await Membership.create({
      user: owner._id,
      market: market._id,
      role: ROLES.MARKET_ADMIN,
      status: "active",
      invitedBy: actorId,
    });
    if (!owner.roles.includes(ROLES.MARKET_ADMIN)) {
      owner.roles.push(ROLES.MARKET_ADMIN);
      owner.defaultMarket = market._id;
      await owner.save();
    }

    await writeAudit({
      actor: actorId,
      market: String(market._id),
      action: "market.create",
      entity: "Market",
      entityId: String(market._id),
      diff: { name: market.name, slug, owner: input.ownerEmail },
    });
    logger.info({ marketId: String(market._id) }, "Market created");
    return market;
  },

  async suspend(marketId: string, actorId: string, suspend: boolean): Promise<MarketDoc> {
    await connectToDatabase();
    const market = await marketRepository.updateById(marketId, {
      $set: { status: suspend ? "suspended" : "active", updatedBy: actorId },
    });
    if (!market) throw Errors.notFound("Market not found");
    await writeAudit({
      actor: actorId,
      market: marketId,
      action: suspend ? "market.suspend" : "market.activate",
      entity: "Market",
      entityId: marketId,
    });
    return market;
  },

  async reassignAdmin(marketId: string, newOwnerEmail: string, actorId: string): Promise<MarketDoc> {
    await connectToDatabase();
    const market = await marketRepository.findById(marketId);
    if (!market) throw Errors.notFound("Market not found");

    const newOwner = await User.findOne({ email: newOwnerEmail });
    if (!newOwner) throw Errors.notFound("New owner not found");
    if (await marketRepository.findByOwner(String(newOwner._id))) {
      throw Errors.conflict("Target user already owns a market");
    }

    const previousOwner = String(market.owner);

    // Demote previous owner's membership, promote the new one.
    await Membership.findOneAndUpdate(
      { user: previousOwner, market: marketId },
      { $set: { status: "suspended" } },
    );
    await Membership.findOneAndUpdate(
      { user: newOwner._id, market: marketId },
      { $set: { role: ROLES.MARKET_ADMIN, status: "active", invitedBy: actorId } },
      { upsert: true },
    );

    market.owner = newOwner._id;
    market.set("updatedBy", actorId);
    await market.save();

    if (!newOwner.roles.includes(ROLES.MARKET_ADMIN)) {
      newOwner.roles.push(ROLES.MARKET_ADMIN);
      await newOwner.save();
    }

    await writeAudit({
      actor: actorId,
      market: marketId,
      action: "market.reassign_admin",
      entity: "Market",
      entityId: marketId,
      diff: { from: previousOwner, to: String(newOwner._id) },
    });
    return market;
  },

  async list(query: unknown): Promise<Paginated<MarketDoc>> {
    await connectToDatabase();
    const pagination = paginationSchema.parse(query);
    return marketRepository.paginate({}, pagination, { populate: "owner" });
  },

  async getBySlug(slug: string): Promise<MarketDoc> {
    await connectToDatabase();
    const market = await marketRepository.findBySlug(slug);
    if (!market || market.status !== "active") throw Errors.notFound("Market not found");
    return market;
  },
};
