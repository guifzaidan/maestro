import { createCipheriv, createDecipheriv, randomBytes, hkdfSync } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Criptografia simétrica AES-256-GCM para segredos (tokens Claude, keys de conexão).
 *
 * A chave é DERIVADA da DATABASE_AUTH_TOKEN (HKDF-SHA256) — que já existe em
 * qualquer ambiente que fale com o Turso (localhost e deploy). Assim a mesma
 * chave vale em todos os lugares sem configurar env nova, e funciona em
 * serverless (sem escrever em disco). Sem auth token (ex: SQLite local), cai
 * em CONNECTIONS_SECRET ou num arquivo local gerado (só dev).
 *
 * Nota de segurança: quem tem a DATABASE_AUTH_TOKEN consegue derivar a chave —
 * a cifra protege contra vazamento dos dados SEM o token (dump/backup/screenshot),
 * não contra quem já tem credencial total do banco.
 *
 * Formato do payload: base64(iv).base64(authTag).base64(ciphertext)
 */

const KEY_FILE = join(process.cwd(), ".connections.key");
let cachedKey: Buffer | null = null;

const NO_KEY_MSG =
  "Criptografia indisponível: faltou DATABASE_AUTH_TOKEN (ou CONNECTIONS_SECRET) no ambiente, " +
  "e o filesystem é somente-leitura. Configure a conexão do Turso no deploy.";

/** Deriva uma chave de 32 bytes da DATABASE_AUTH_TOKEN — determinística. */
function deriveFromAuthToken(authToken: string): Buffer {
  return Buffer.from(hkdfSync("sha256", authToken, "maestro:connections", "aes-256-gcm", 32));
}

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
    throw new Error(NO_KEY_MSG);
  }
  return key;
}

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const authToken = process.env.DATABASE_AUTH_TOKEN;
  if (authToken) {
    cachedKey = deriveFromAuthToken(authToken);
  } else if (process.env.CONNECTIONS_SECRET) {
    const raw = process.env.CONNECTIONS_SECRET;
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
