import { describe, it, expect } from "vitest";
import manifest from "@/app/manifest";

/**
 * A wrong `src`/`sizes` here doesn't fail loudly — it just silently fails
 * Android's install-prompt criteria, which nothing else in this suite would
 * ever catch. Pinning the shape is cheap insurance against that.
 */
describe("web app manifest", () => {
  it("declares standalone display and a name", () => {
    const m = manifest();
    expect(m.display).toBe("standalone");
    expect(m.name).toBeTruthy();
    expect(m.start_url).toBe("/");
  });

  it("includes both an any and a maskable icon at each installable size", () => {
    const icons = manifest().icons ?? [];
    for (const size of ["192x192", "512x512"]) {
      const forSize = icons.filter((i) => i.sizes === size);
      expect(forSize.map((i) => i.purpose)).toEqual(expect.arrayContaining(["any", "maskable"]));
      for (const icon of forSize) {
        expect(icon.type).toBe("image/png");
        expect(icon.src).toMatch(/^\/icons\/\d+$/);
      }
    }
  });
});
