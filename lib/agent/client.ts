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
  onToolPending?: (e: { id: string; name: string }) => void;
  onToolStart?: (e: { id: string; name: string; input: unknown; groupTotal?: number; groupIndex?: number }) => void;
  onToolResult?: (e: { id: string; name: string; result: unknown; groupTotal?: number; groupDone?: number }) => void;
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
          case "tool_pending": handlers.onToolPending?.(evt as never); break;
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
  atualizar_card_linear: "Atualizando card no Linear",
  excluir_card_linear: "Excluindo card no Linear",
  gerar_artefato: "Gerando arquivo",
};

export function toolLabel(name: string): string {
  return TOOL_LABELS[name] ?? name;
}

/* ── Descrições contextuais das ações do maestro ───────────────── */

function short(v: unknown, n = 42): string {
  const s = String(v ?? "").replace(/\s+/g, " ").trim();
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

/** Extrai o nome da tabela de um SELECT … FROM <tabela>. */
function tableFromSql(sql: unknown): string | null {
  const m = /\bfrom\s+["'`]?([a-zA-Z_][\w]*)/i.exec(String(sql ?? ""));
  return m ? m[1] : null;
}

/**
 * Descrição inteligente de UMA ação, usando o input da ferramenta — reflete o
 * que está sendo feito (título do card, time/projeto, arquivo, tabela…).
 */
export function describeTool(name: string, input: unknown): string {
  const i = (input ?? {}) as Record<string, unknown>;
  switch (name) {
    case "criar_tarefa":
      return i.title ? `Criando tarefa “${short(i.title, 40)}”` : "Criando tarefa";
    case "consultar_tarefas":
      return i.todas ? "Lendo tarefas de todas as branches" : "Lendo as tarefas";
    case "listar_bases_de_dados":
      return "Explorando as bases de dados";
    case "consultar_base_de_dados": {
      const t = tableFromSql(i.sql);
      return t ? `Consultando a tabela ${t}` : "Consultando a base de dados";
    }
    case "listar_linear":
      if (i.projeto) return `Lendo o Linear · projeto ${short(i.projeto, 24)}`;
      if (i.time) return `Lendo o Linear · time ${short(i.time, 24)}`;
      return "Lendo o Linear";
    case "criar_card_linear": {
      const titulo = i.titulo ? `“${short(i.titulo, 36)}”` : "card";
      const onde = i.projeto ? ` em ${short(i.projeto, 20)}` : i.time ? ` em ${short(i.time, 20)}` : "";
      return `Criando ${titulo}${onde} no Linear`;
    }
    case "atualizar_card_linear": {
      const id = i.identificador ? String(i.identificador) : "card";
      if (i.status) return `Movendo ${id} para ${short(i.status, 20)}`;
      if (i.responsavel) return `Atribuindo ${id} a ${short(i.responsavel, 20)}`;
      if (i.data) return `Ajustando prazo de ${id}`;
      return `Atualizando ${id} no Linear`;
    }
    case "excluir_card_linear": {
      const id = i.identificador ? String(i.identificador) : "card";
      return `Excluindo ${id} no Linear`;
    }
    case "gerar_artefato": {
      const nome = i.nome ? String(i.nome) : "arquivo";
      const ext = i.formato ? `.${i.formato}` : "";
      return `Gerando ${short(`${nome}${ext}`, 40)}`;
    }
    default:
      return TOOL_LABELS[name] ?? name;
  }
}

/** Rótulo agregado pra um lote da mesma ferramenta (plural). */
export function groupLabel(name: string): string {
  switch (name) {
    case "criar_card_linear": return "Criando cards no Linear";
    case "atualizar_card_linear": return "Atualizando cards no Linear";
    case "excluir_card_linear": return "Excluindo cards no Linear";
    case "criar_tarefa": return "Criando tarefas";
    case "consultar_base_de_dados": return "Consultando as bases de dados";
    case "gerar_artefato": return "Gerando arquivos";
    default: return TOOL_LABELS[name] ?? name;
  }
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
