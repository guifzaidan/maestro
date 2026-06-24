import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Criptografia simétrica AES-256-GCM para segredos (tokens Claude, keys de conexão).
 * A chave vem de CONNECTIONS_SECRET (32 bytes em base64/hex). Em dev local, se a
 * env não estiver setada, é auto-gerada e persistida em `.connections.key`
 * (gitignored). Em deploy serverless o filesystem é somente-leitura, então a env
 * CONNECTIONS_SECRET é obrigatória lá. Os segredos são cifrados antes de ir pro
 * banco e só decifrados no servidor; o cliente nunca recebe o valor em claro.
 *
 * Formato do payload: base64(iv).base64(authTag).base64(ciphertext)
 */

const KEY_FILE = join(process.cwd(), ".connections.key");
let cachedKey: Buffer | null = null;

const NO_KEY_MSG =
  "Criptografia indisponível: defina a env CONNECTIONS_SECRET (32 bytes em base64 ou hex) " +
  "no ambiente do deploy. Em serverless o filesystem é somente-leitura, então a chave não " +
  "pode ser gerada em arquivo. Use o MESMO valor do seu .env.local local.";

/** Lê a chave do arquivo local ou gera+persiste uma nova (32 bytes). Só dev local. */
function fileKey(): Buffer {
  if (existsSync(KEY_FILE)) {
    const raw = readFileSync(KEY_FILE, "utf8").trim();
    const key = Buffer.from(raw, "base64");
    if (key.length === 32) return key;
  }
  const key = randomBytes(32);
  try {
    writeFileSync(KEY_FILE, key.toString("base64"), { mode: 0o600 });
  } catch {
    // Filesystem somente-leitura (ex: Vercel/Lambda) — não dá pra persistir.
    throw new Error(NO_KEY_MSG);
  }
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
