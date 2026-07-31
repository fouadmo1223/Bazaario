import { connectToDatabase } from "@/server/database/connection";
import { Banner, type BannerDoc } from "@/server/database/models/banner.model";
import { Errors } from "@/shared/lib/errors";
import { writeAudit } from "./audit.service";

export type BannerInput = {
  message: string;
  linkUrl?: string | null;
  linkLabel?: string | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
  isActive: boolean;
};

/**
 * Banner authoring for the vendor dashboard, plus the one public read the
 * storefront needs. Every authoring operation is vendor-scoped — the caller
 * must already have passed `requireVendorPermission(vendorId, CMS_WRITE)`.
 */
export const bannerService = {
  /** All of a vendor's banners, newest first. */
  async list(vendorId: string): Promise<BannerDoc[]> {
    await connectToDatabase();
    return Banner.find({ vendor: vendorId }).sort({ createdAt: -1 }).exec();
  },

  async create(vendorId: string, input: BannerInput, actorId: string): Promise<BannerDoc> {
    await connectToDatabase();
    const banner = await Banner.create({ ...input, vendor: vendorId, createdBy: actorId });
    await writeAudit({
      actor: actorId, vendor: vendorId, action: "banner.create",
      entity: "Banner", entityId: String(banner._id), diff: { message: banner.message },
    });
    return banner;
  },

  async update(vendorId: string, bannerId: string, input: BannerInput, actorId: string): Promise<BannerDoc> {
    await connectToDatabase();
    const banner = await Banner.findOne({ _id: bannerId, vendor: vendorId });
    if (!banner) throw Errors.notFound("Banner not found");

    Object.assign(banner, input, { updatedBy: actorId });
    await banner.save();

    await writeAudit({
      actor: actorId, vendor: vendorId, action: "banner.update",
      entity: "Banner", entityId: bannerId,
    });
    return banner;
  },

  async remove(vendorId: string, bannerId: string, actorId: string): Promise<void> {
    await connectToDatabase();
    const banner = await Banner.findOne({ _id: bannerId, vendor: vendorId });
    if (!banner) throw Errors.notFound("Banner not found");
    banner.deletedAt = new Date();
    banner.updatedBy = actorId as never;
    await banner.save();

    await writeAudit({
      actor: actorId, vendor: vendorId, action: "banner.delete",
      entity: "Banner", entityId: bannerId,
    });
  },

  /**
   * The one banner the storefront shows, if any: active and inside its
   * window (an unset bound means "no limit" on that side). Newest wins if a
   * vendor leaves more than one active at once, rather than stacking bars.
   */
  async getActive(vendorId: string): Promise<BannerDoc | null> {
    await connectToDatabase();
    const now = new Date();
    return Banner.findOne({
      vendor: vendorId,
      isActive: true,
      $and: [
        { $or: [{ startsAt: null }, { startsAt: { $lte: now } }] },
        { $or: [{ endsAt: null }, { endsAt: { $gte: now } }] },
      ],
    }).sort({ createdAt: -1 });
  },
};
