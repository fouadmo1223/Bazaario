import { BaseRepository } from "./base.repository";
import { Vendor, type VendorRaw, type VendorDoc } from "@/server/database/models/vendor.model";

class VendorRepository extends BaseRepository<VendorRaw> {
  constructor() {
    super(Vendor);
  }

  findBySlug(slug: string): Promise<VendorDoc | null> {
    return this.findOne({ slug });
  }

  findByOwner(ownerId: string): Promise<VendorDoc | null> {
    return this.findOne({ owner: ownerId });
  }
}

export const vendorRepository = new VendorRepository();
