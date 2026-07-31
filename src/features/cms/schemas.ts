import { z } from "zod";

/**
 * `<input type="date">` gives an empty string, not undefined, when cleared —
 * both mean "no bound" here, so both collapse to `null` before the service
 * ever sees them.
 */
const optionalDate = z
  .string()
  .optional()
  .transform((v) => (v ? new Date(v) : null));

const optionalText = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : null));

export const bannerInputSchema = z
  .object({
    message: z.string().trim().min(1, "Write something to announce").max(200),
    linkUrl: z.union([z.literal(""), z.string().url("Enter a full URL")]).optional(),
    linkLabel: z.string().max(40).optional(),
    startsAt: z.string().optional(),
    endsAt: z.string().optional(),
    isActive: z.boolean(),
  })
  .transform((v) => ({
    message: v.message,
    linkUrl: v.linkUrl ? v.linkUrl : null,
    linkLabel: optionalText.parse(v.linkLabel),
    startsAt: optionalDate.parse(v.startsAt),
    endsAt: optionalDate.parse(v.endsAt),
    isActive: v.isActive,
  }))
  .refine((v) => !v.startsAt || !v.endsAt || v.startsAt <= v.endsAt, {
    message: "The window ends before it starts",
    path: ["endsAt"],
  });

export type BannerInput = z.infer<typeof bannerInputSchema>;
