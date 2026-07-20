import { profileService } from "@/server/services/profile.service";

/**
 * Read models for the profile screen. Server Components render these and pass
 * them to client forms, so every field is plain and serializable — no Mongoose
 * documents or ObjectIds cross the boundary.
 */

export type ProfileView = {
  id: string;
  name: string;
  email: string;
  phone: string;
  avatar: string;
  emailVerified: boolean;
};

export type AddressRow = {
  id: string;
  label: string;
  recipient: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
};

export async function getProfile(userId: string): Promise<ProfileView> {
  const user = await profileService.get(userId);
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    // The forms are controlled inputs, so nulls become empty strings here
    // rather than in every field.
    phone: user.phone ?? "",
    avatar: user.avatar ?? "",
    emailVerified: user.emailVerifiedAt != null,
  };
}

export async function getAddresses(userId: string): Promise<AddressRow[]> {
  const addresses = await profileService.listAddresses(userId);
  return addresses.map((a) => ({
    id: String(a._id),
    label: a.label ?? "Home",
    recipient: a.recipient,
    phone: a.phone,
    line1: a.line1,
    line2: a.line2 ?? "",
    city: a.city,
    region: a.region ?? "",
    postalCode: a.postalCode ?? "",
    country: a.country,
    isDefault: a.isDefault ?? false,
  }));
}
