import crypto from "crypto";

function deriveKey(): Buffer {
  const raw =
    process.env.INTEGRATION_ENCRYPTION_KEY?.trim() ||
    process.env.SECRET_KEY?.trim() ||
    "crisistwin-dev-ephemeral-key";
  return crypto.createHash("sha256").update(raw, "utf8").digest();
}

/** Encrypt sensitive integration credentials at rest using AES-256-GCM. */
export function encryptSecret(plaintext: string): string {
  const trimmed = plaintext.trim();
  if (!trimmed) return "";
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", deriveKey(), iv);
  const encrypted = Buffer.concat([cipher.update(trimmed, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

/** Decrypt a stored encrypted secret on the server only. Never return plaintext to the browser. */
export function decryptSecret(stored: string | null | undefined): string {
  if (!stored) return "";
  if (!stored.startsWith("enc:v1:")) return stored;
  const parts = stored.split(":");
  if (parts.length !== 5) return "";
  try {
    const iv = Buffer.from(parts[2], "base64");
    const tag = Buffer.from(parts[3], "base64");
    const ciphertext = Buffer.from(parts[4], "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", deriveKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}

export function maskSecretHint(storedOrPlain: string | null | undefined): string {
  const plain = decryptSecret(storedOrPlain);
  if (!plain) return "";
  if (plain.length <= 4) return "••••";
  return `••••${plain.slice(-4)}`;
}
