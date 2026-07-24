import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  signAvatarUpload,
  isOwnAvatarUrl,
  AVATAR_FOLDER,
  signChatUpload,
  isChatAttachmentUrl,
  CHAT_FOLDER,
} from "@/server/storage/cloudinary";

/**
 * Avatar upload signing.
 *
 * Pure and fast — no database, no network, and deliberately no call to
 * Cloudinary. What is worth pinning is the *shape of the capability*: that a
 * signature is scoped to one user, and that the ownership check cannot be
 * talked into accepting somebody else's URL.
 */

// Set in `test/setup.ts`, which must run before `getServerEnv()` memoizes.
const CLOUD = "test-cloud";
const SECRET = "test-api-secret";

const userId = "6a5f00000000000000000001";
const other = "6a5f00000000000000000002";

describe("signAvatarUpload", () => {
  it("scopes the public id to the user", () => {
    expect(signAvatarUpload(userId).publicId).toBe(`${AVATAR_FOLDER}/${userId}`);
    expect(signAvatarUpload(other).publicId).toBe(`${AVATAR_FOLDER}/${other}`);
  });

  /**
   * Cloudinary's rule, reproduced independently: sorted `k=v` pairs joined with
   * `&`, secret appended, SHA-1. If the implementation drifts from this, every
   * upload fails with an opaque 401 from a third party — worth catching here.
   */
  it("signs exactly the parameters the client is told to send", () => {
    const signed = signAvatarUpload(userId);

    const canonical = [
      "overwrite=true",
      `public_id=${AVATAR_FOLDER}/${userId}`,
      `timestamp=${signed.timestamp}`,
    ].join("&");
    const expected = createHash("sha1").update(canonical + SECRET).digest("hex");

    expect(signed.signature).toBe(expected);
  });

  it("does not reuse a signature across users", () => {
    const a = signAvatarUpload(userId);
    const b = signAvatarUpload(other);
    expect(a.signature).not.toBe(b.signature);
  });

  it("never exposes the api secret", () => {
    expect(JSON.stringify(signAvatarUpload(userId))).not.toContain(SECRET);
  });
});

describe("isOwnAvatarUrl", () => {
  const valid = `https://res.cloudinary.com/${CLOUD}/image/upload/v1712345678/${AVATAR_FOLDER}/${userId}.webp`;

  it("accepts this user's own uploaded avatar", () => {
    expect(isOwnAvatarUrl(valid, userId)).toBe(true);
  });

  it("accepts a URL carrying transformations", () => {
    const transformed = `https://res.cloudinary.com/${CLOUD}/image/upload/c_fill,w_128/v1712345678/${AVATAR_FOLDER}/${userId}.jpg`;
    expect(isOwnAvatarUrl(transformed, userId)).toBe(true);
  });

  /** The point of the check: one user must not be able to claim another's. */
  it("refuses another user's avatar", () => {
    expect(isOwnAvatarUrl(valid, other)).toBe(false);
  });

  it("refuses a different Cloudinary account", () => {
    const foreign = valid.replace(CLOUD, "someone-elses-cloud");
    expect(isOwnAvatarUrl(foreign, userId)).toBe(false);
  });

  it("refuses a different host", () => {
    expect(isOwnAvatarUrl(`https://evil.example.com/${AVATAR_FOLDER}/${userId}.webp`, userId)).toBe(
      false,
    );
  });

  /**
   * The host check must be on the parsed hostname, not a substring: a URL whose
   * *path* or subdomain merely mentions the real host is a different origin.
   */
  it("refuses a host that only looks like Cloudinary", () => {
    for (const url of [
      `https://res.cloudinary.com.evil.example/${CLOUD}/image/upload/v1/${AVATAR_FOLDER}/${userId}.webp`,
      `https://evil.example/res.cloudinary.com/${CLOUD}/image/upload/v1/${AVATAR_FOLDER}/${userId}.webp`,
    ]) {
      expect(isOwnAvatarUrl(url, userId)).toBe(false);
    }
  });

  it("refuses plain http", () => {
    expect(isOwnAvatarUrl(valid.replace("https://", "http://"), userId)).toBe(false);
  });

  it("refuses a path that merely contains the user id", () => {
    const sneaky = `https://res.cloudinary.com/${CLOUD}/image/upload/v1/${AVATAR_FOLDER}/${userId}/../${other}.webp`;
    expect(isOwnAvatarUrl(sneaky, userId)).toBe(false);
  });

  it("refuses junk", () => {
    for (const url of ["", "not-a-url", "data:image/png;base64,AAAA", "javascript:alert(1)"]) {
      expect(isOwnAvatarUrl(url, userId)).toBe(false);
    }
  });
});

describe("signChatUpload", () => {
  it("scopes the folder to the uploader", () => {
    expect(signChatUpload(userId).folder).toBe(`${CHAT_FOLDER}/${userId}`);
    expect(signChatUpload(other).folder).toBe(`${CHAT_FOLDER}/${other}`);
  });

  /**
   * Unlike an avatar this fixes no `public_id` — a thread accumulates many
   * files. Only `folder` and `timestamp` are signed, so that is exactly what the
   * client must send; drift here fails every upload with an opaque 401.
   */
  it("signs exactly the parameters the client is told to send", () => {
    const signed = signChatUpload(userId);

    const canonical = [`folder=${CHAT_FOLDER}/${userId}`, `timestamp=${signed.timestamp}`].join("&");
    const expected = createHash("sha1").update(canonical + SECRET).digest("hex");

    expect(signed.signature).toBe(expected);
  });

  it("does not reuse a signature across users", () => {
    expect(signChatUpload(userId).signature).not.toBe(signChatUpload(other).signature);
  });

  it("never exposes the api secret", () => {
    expect(JSON.stringify(signChatUpload(userId))).not.toContain(SECRET);
  });
});

/**
 * The gate on stored attachment URLs.
 *
 * Attachments arrive as plain strings on a message the sender could POST
 * directly, and they end up as `<img>`/`<video>` sources in *other people's*
 * browsers. So this is the check that keeps a thread from becoming a way to
 * make someone else's browser fetch an arbitrary URL.
 */
describe("isChatAttachmentUrl", () => {
  const image = `https://res.cloudinary.com/${CLOUD}/image/upload/v1712345678/${CHAT_FOLDER}/${userId}/abc123.png`;
  const video = `https://res.cloudinary.com/${CLOUD}/video/upload/v1712345678/${CHAT_FOLDER}/${userId}/clip.mp4`;

  it("accepts an image and a video from our own chat folder", () => {
    expect(isChatAttachmentUrl(image)).toBe(true);
    expect(isChatAttachmentUrl(video)).toBe(true);
  });

  it("accepts a URL carrying transformations", () => {
    const transformed = `https://res.cloudinary.com/${CLOUD}/image/upload/c_fill,w_400/v1712345678/${CHAT_FOLDER}/${userId}/abc.jpg`;
    expect(isChatAttachmentUrl(transformed)).toBe(true);
  });

  it("refuses a different Cloudinary account", () => {
    expect(isChatAttachmentUrl(image.replace(CLOUD, "someone-elses-cloud"))).toBe(false);
  });

  it("refuses a different host", () => {
    expect(isChatAttachmentUrl(`https://evil.example.com/${CHAT_FOLDER}/x.png`)).toBe(false);
  });

  /** Host must be the parsed hostname, never a substring of the URL. */
  it("refuses a host that only looks like Cloudinary", () => {
    for (const url of [
      `https://res.cloudinary.com.evil.example/${CLOUD}/image/upload/v1/${CHAT_FOLDER}/${userId}/a.png`,
      `https://evil.example/res.cloudinary.com/${CLOUD}/image/upload/v1/${CHAT_FOLDER}/${userId}/a.png`,
    ]) {
      expect(isChatAttachmentUrl(url)).toBe(false);
    }
  });

  it("refuses plain http", () => {
    expect(isChatAttachmentUrl(image.replace("https://", "http://"))).toBe(false);
  });

  /** Our own cloud, but a folder this capability was never issued for. */
  it("refuses a non-chat folder on our own cloud", () => {
    const avatar = `https://res.cloudinary.com/${CLOUD}/image/upload/v1712345678/${AVATAR_FOLDER}/${userId}.webp`;
    expect(isChatAttachmentUrl(avatar)).toBe(false);
  });

  /** "chat" appearing in the query string is not "chat" in the path. */
  it("refuses a URL that only mentions the chat folder off-path", () => {
    const sneaky = `https://res.cloudinary.com/${CLOUD}/image/upload/v1/${AVATAR_FOLDER}/${userId}.webp?x=/${CHAT_FOLDER}/`;
    expect(isChatAttachmentUrl(sneaky)).toBe(false);
  });

  it("refuses junk", () => {
    for (const url of ["", "not-a-url", "data:image/png;base64,AAAA", "javascript:alert(1)"]) {
      expect(isChatAttachmentUrl(url)).toBe(false);
    }
  });
});
