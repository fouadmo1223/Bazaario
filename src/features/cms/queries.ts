import { bannerService } from "@/server/services/banner.service";
import type { BannerDoc } from "@/server/database/models/banner.model";

/**
 * Read models for banners. Everything is mapped to plain serializable values
 * before it leaves here — see `NoDocuments` in `server/cache/redis.ts` for why
 * a Mongoose document must never cross into a Client Component.
 */

export type BannerView = {
  id: string;
  message: string;
  linkUrl: string | null;
  linkLabel: string | null;
  /** ISO or null — formatted in the view so the server and client agree. */
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
  createdAt: string;
};

function toView(b: BannerDoc): BannerView {
  return {
    id: String(b._id),
    message: b.message,
    linkUrl: b.linkUrl ?? null,
    linkLabel: b.linkLabel ?? null,
    startsAt: b.startsAt ? b.startsAt.toISOString() : null,
    endsAt: b.endsAt ? b.endsAt.toISOString() : null,
    isActive: b.isActive,
    createdAt: b.createdAt.toISOString(),
  };
}

/** All of a vendor's banners, for the dashboard. */
export async function listVendorBanners(vendorId: string): Promise<BannerView[]> {
  const banners = await bannerService.list(vendorId);
  return banners.map(toView);
}

/** The one banner (if any) a vendor's storefront should show right now. */
export async function getActiveBanner(vendorId: string): Promise<BannerView | null> {
  const banner = await bannerService.getActive(vendorId);
  return banner ? toView(banner) : null;
}
