import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Criptografia simétrica AES-256-GCM para segredos de conexão (tokens, keys).
 * A chave vem de CONNECTIONS_SECRET (32 bytes em base64 ou hex). Os segredos
 * são cifrados antes de ir pro banco e só decifrados no servidor — o cliente
 * nunca recebe o valor em claro.
 *
 * Formato do payload: base64(iv).base64(authTag).base64(ciphertext)
 */

function getKey(): Buffer {
  const raw = process.env.CONNECTIONS_SECRET;
  if (!raw) throw new Error("CONNECTIONS_SECRET ausente — defina uma chave de 32 bytes (base64/hex).");
  const key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("CONNECTIONS_SECRET deve ter 32 bytes (256 bits).");
  return key;
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${ct.toString("base64")}`;
}

export function decryptSecret(payload: string): string {
  const [ivB64, tagB64, ctB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !ctB64) throw new Error("payload cifrado inválido");
  const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]).toString("utf8");
}

/** Mascara um segredo para exibição (mostra só os últimos 4 chars). */
export function maskSecret(plain: string): string {
  if (!plain) return "";
  const last = plain.slice(-4);
  return `••••••••${last}`;
}
