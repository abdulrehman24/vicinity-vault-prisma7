import crypto from "node:crypto";

const secret = process.env.APP_SECRET_KEY || "";
const key = secret ? crypto.createHash("sha256").update(secret).digest() : null;

const PREFIX_ENC = "enc:";
const PREFIX_PLAIN = "plain:";

export const encryptSecret = (value) => {
  const text = String(value || "").trim();
  if (!text) return null;

  if (!key) {
    return `${PREFIX_PLAIN}${Buffer.from(text, "utf8").toString("base64")}`;
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${PREFIX_ENC}${Buffer.concat([iv, authTag, encrypted]).toString("base64")}`;
};

export const decryptSecret = (value) => {
  if (!value) return null;
  if (!value.startsWith(PREFIX_PLAIN) && !value.startsWith(PREFIX_ENC)) {
    return value;
  }
  if (value.startsWith(PREFIX_PLAIN)) {
    return Buffer.from(value.slice(PREFIX_PLAIN.length), "base64").toString("utf8");
  }
  if (!value.startsWith(PREFIX_ENC) || !key) return null;

  const buffer = Buffer.from(value.slice(PREFIX_ENC.length), "base64");
  const iv = buffer.subarray(0, 12);
  const authTag = buffer.subarray(12, 28);
  const payload = buffer.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(payload), decipher.final()]);
  return decrypted.toString("utf8");
};

export const maskSecret = (value) => {
  const plain = decryptSecret(value);
  if (!plain) return null;
  if (plain.length <= 4) return "••••";
  return `${"•".repeat(Math.max(4, plain.length - 4))}${plain.slice(-4)}`;
};
