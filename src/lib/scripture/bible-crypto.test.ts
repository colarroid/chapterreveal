import { createCipheriv, randomBytes, webcrypto } from "node:crypto";
import { describe, expect, it } from "vitest";

// /api/bible encrypts with Node (AES-256-GCM: IV, then ciphertext, then tag);
// the console decrypts with the browser's Web Crypto. They must agree.
describe("encrypted Bible format", () => {
  it("decrypts in the browser what the server encrypted", async () => {
    const key = randomBytes(32);
    const text = JSON.stringify({ id: "nkjv", books: [[["In the beginning God created the heavens and the earth."]]] });

    // As the route does.
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const sent = Buffer.concat([iv, cipher.update(Buffer.from(text)), cipher.final(), cipher.getAuthTag()]);

    // As bible-crypto does.
    const data = sent.buffer.slice(sent.byteOffset, sent.byteOffset + sent.byteLength);
    const k = await webcrypto.subtle.importKey("raw", key, "AES-GCM", false, ["decrypt"]);
    const plain = await webcrypto.subtle.decrypt({ name: "AES-GCM", iv: data.slice(0, 12) }, k, data.slice(12));
    expect(new TextDecoder().decode(plain)).toBe(text);
  });

  it("can't be read with another church's key", async () => {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", randomBytes(32), iv);
    const sent = Buffer.concat([iv, cipher.update(Buffer.from("secret")), cipher.final(), cipher.getAuthTag()]);
    const data = sent.buffer.slice(sent.byteOffset, sent.byteOffset + sent.byteLength);
    const other = await webcrypto.subtle.importKey("raw", randomBytes(32), "AES-GCM", false, ["decrypt"]);
    await expect(webcrypto.subtle.decrypt({ name: "AES-GCM", iv: data.slice(0, 12) }, other, data.slice(12))).rejects.toThrow();
  });
});
