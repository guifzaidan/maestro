/**
 * Valida uma API key da Claude sem gastar tokens — bate no endpoint /v1/models
 * (GET, gratuito) e confere o status. Server-side apenas.
 */
export interface TokenCheck {
  ok: boolean;
  model?: string;
  error?: string;
}

export async function validateClaudeToken(token: string): Promise<TokenCheck> {
  try {
    const res = await fetch("https://api.anthropic.com/v1/models?limit=1", {
      headers: {
        "x-api-key": token,
        "anthropic-version": "2023-06-01",
      },
    });
    if (res.ok) {
      const data = (await res.json().catch(() => ({}))) as { data?: { id?: string }[] };
      return { ok: true, model: data?.data?.[0]?.id };
    }
    const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    const msg = err?.error?.message;
    if (res.status === 401) return { ok: false, error: msg ?? "Chave inválida ou revogada." };
    return { ok: false, error: msg ?? `Falha (HTTP ${res.status}).` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
