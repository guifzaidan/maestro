import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Criptografia simétrica AES-256-GCM para segredos (tokens Claude, keys de conexão).
 * A chave vem de CONNECTIONS_SECRET (32 bytes em base64/hex) quando definida. Se
 * ausente, é auto-gerada e persistida em `.connections.key` (gitignored) — assim
 * o sistema funciona sem nenhuma configuração manual de env. Os segredos são
 * cifrados antes de ir pro banco e só decifrados no servidor; o cliente nunca
 * recebe o valor em claro.
 *
 * Formato do payload: base64(iv).base64(authTag).base64(ciphertext)
 */

const KEY_FILE = join(process.cwd(), ".connections.key");
let cachedKey: Buffer | null = null;

/** Lê a chave do arquivo local ou gera+persiste uma nova (32 bytes). */
function fileKey(): Buffer {
  if (existsSync(KEY_FILE)) {
    const raw = readFileSync(KEY_FILE, "utf8").trim();
    const key = Buffer.from(raw, "base64");
    if (key.length === 32) return key;
  }
  const key = randomBytes(32);
  writeFileSync(KEY_FILE, key.toString("base64"), { mode: 0o600 });
  return key;
}

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.CONNECTIONS_SECRET;
  if (raw) {
    const key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
    if (key.length !== 32) throw new Error("CONNECTIONS_SECRET deve ter 32 bytes (256 bits).");
    cachedKey = key;
  } else {
    cachedKey = fileKey();
  }
  return cachedKey;
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
