import { BaseRepository } from "./base.repository";
import { Market, type MarketRaw, type MarketDoc } from "@/server/database/models/market.model";

class MarketRepository extends BaseRepository<MarketRaw> {
  constructor() {
    super(Market);
  }

  findBySlug(slug: string): Promise<MarketDoc | null> {
    return this.findOne({ slug });
  }

  findByOwner(ownerId: string): Promise<MarketDoc | null> {
    return this.findOne({ owner: ownerId });
  }
}

export const marketRepository = new MarketRepository();
