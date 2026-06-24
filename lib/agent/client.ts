export interface AgentAttachment {
  type: "image" | "pdf" | "text";
  filename: string;
  content: string;   // base64 para image/pdf, texto puro para text
  mimeType?: string;
}

export interface AgentMessage {
  role: "user" | "assistant";
  content: string;
  attachments?: AgentAttachment[];
}

export interface AgentHandlers {
  onText?: (delta: string) => void;
  onToolStart?: (e: { id: string; name: string; input: unknown }) => void;
  onToolResult?: (e: { id: string; name: string; result: unknown }) => void;
  onDone?: () => void;
  onError?: (msg: string) => void;
}

/**
 * Consome o stream SSE de /api/agent e dispara os handlers conforme os eventos
 * chegam. Passe um AbortSignal para poder interromper.
 */
export async function streamAgent(
  body: { branch: string; messages: AgentMessage[] },
  handlers: AgentHandlers,
  signal?: AbortSignal,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch("/api/agent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") return;
    handlers.onError?.(e instanceof Error ? e.message : String(e));
    return;
  }

  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({}));
    handlers.onError?.(err.message || `Erro ${res.status}`);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split("\n\n");
      buf = parts.pop() ?? "";
      for (const part of parts) {
        const line = part.trim();
        if (!line.startsWith("data:")) continue;
        const json = line.slice(5).trim();
        if (!json) continue;
        let evt: { type: string; [k: string]: unknown };
        try {
          evt = JSON.parse(json);
        } catch {
          continue;
        }
        switch (evt.type) {
          case "text": handlers.onText?.(evt.delta as string); break;
          case "tool_start": handlers.onToolStart?.(evt as never); break;
          case "tool_result": handlers.onToolResult?.(evt as never); break;
          case "done": handlers.onDone?.(); break;
          case "error": handlers.onError?.(evt.message as string); break;
        }
      }
    }
  } catch (e) {
    if ((e as Error).name !== "AbortError") {
      handlers.onError?.(e instanceof Error ? e.message : String(e));
    }
  }
}

const TOOL_LABELS: Record<string, string> = {
  selecionar_branch: "Selecionando branch",
  criar_tarefa: "Criando tarefa",
  consultar_tarefas: "Consultando tarefas",
  listar_bases_de_dados: "Explorando bases de dados",
  consultar_base_de_dados: "Consultando base de dados",
  listar_linear: "Consultando o Linear",
  criar_card_linear: "Criando card no Linear",
  gerar_artefato: "Gerando arquivo",
};

export function toolLabel(name: string): string {
  return TOOL_LABELS[name] ?? name;
}

/** Converte erros técnicos do agente em mensagens claras em PT-BR. */
export function friendlyAgentError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("credit balance") || m.includes("plans & billing"))
    return "Sua conta Anthropic está sem créditos. Adicione créditos em console.anthropic.com → Plans & Billing.";
  if (m.includes("no_key") || m.includes("não configurada"))
    return "Configure sua ANTHROPIC_API_KEY no .env.local para o maestro agir.";
  if (m.includes("authentication") || m.includes("invalid x-api-key") || m.includes("401"))
    return "API key inválida. Confira a ANTHROPIC_API_KEY no .env.local.";
  if (m.includes("rate limit") || m.includes("429"))
    return "Limite de requisições atingido. Tente de novo em instantes.";
  if (m.includes("overloaded") || m.includes("529"))
    return "A API da Anthropic está sobrecarregada agora. Tente de novo em instantes.";
  return msg.length > 160 ? msg.slice(0, 160) + "…" : msg;
}
