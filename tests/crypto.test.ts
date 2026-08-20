import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

describe("token encryption (for Google refresh tokens at rest)", () => {
  it("round-trips a secret", () => {
    const plaintext = "1//0gExampleRefreshTokenValueThatWouldComeFromGoogle";
    const encrypted = encryptSecret(plaintext);
    expect(encrypted).not.toContain(plaintext);
    expect(decryptSecret(encrypted)).toBe(plaintext);
  });

  it("produces different ciphertext for the same plaintext each time (random IV)", () => {
    const plaintext = "same-secret";
    expect(encryptSecret(plaintext)).not.toBe(encryptSecret(plaintext));
  });

  it("fails to decrypt if the ciphertext is tampered with", () => {
    const encrypted = encryptSecret("some-refresh-token");
    const [iv, tag, ciphertext] = encrypted.split(".");
    const tampered = [iv, tag, ciphertext.slice(0, -4) + "abcd"].join(".");
    expect(() => decryptSecret(tampered)).toThrow();
  });
});
