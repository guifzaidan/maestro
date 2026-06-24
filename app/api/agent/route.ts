import Anthropic from "@anthropic-ai/sdk";
import { buildTools, executeTool } from "@/lib/agent/tools";
import { buildSystemPrompt } from "@/lib/agent/prompt";
import { getBranchToken } from "@/lib/db/branches";
import { recordUsage } from "@/lib/db/usage";
import { BRANCH_IDS } from "@/lib/theme";
import type { AgentAttachment } from "@/lib/agent/client";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Seleciona a API key da branch. Prioridade: token salvo no banco (Configurações
 * → Branchs) → env por branch → env global. Na home (branch vazia) usa o token
 * do orquestrador (branch "pessoal").
 */
async function keyFor(branch: string): Promise<string | undefined> {
  if (!branch) {
    // Home/branchless: token do orquestrador (branch pessoal) ou env global.
    return (await getBranchToken(BRANCH_IDS.pessoal)) || process.env.ANTHROPIC_API_KEY;
  }
  const dbToken = await getBranchToken(branch);
  if (dbToken) return dbToken;
  if (branch === BRANCH_IDS.dux) return process.env.ANTHROPIC_API_KEY_DUX || process.env.ANTHROPIC_API_KEY;
  if (branch === BRANCH_IDS.sheep) return process.env.ANTHROPIC_API_KEY_SHEEP || process.env.ANTHROPIC_API_KEY;
  return process.env.ANTHROPIC_API_KEY;
}

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
const MAX_TOOL_ROUNDS = 8;

export async function POST(request: Request) {
  const { branch = BRANCH_IDS.pessoal, messages = [] } = await request.json() as {
    branch?: string;
    messages?: Array<{ role: "user" | "assistant"; content: string; attachments?: AgentAttachment[] }>;
  };

  const apiKey = await keyFor(branch);
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "no_key", message: "Nenhum token Claude para esta branch — configure em Configurações → Branchs ou no .env.local." }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  const client = new Anthropic({ apiKey });
  const [system, tools] = await Promise.all([buildSystemPrompt(branch), buildTools()]);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (obj: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      try {
        const convo: Anthropic.MessageParam[] = messages.map((m) => {
          if (m.role === "assistant" || !m.attachments?.length) {
            return { role: m.role, content: m.content };
          }
          // Mensagem do usuário com anexos → content array com blocos nativos
          const blocks: Anthropic.ContentBlockParam[] = [];
          for (const a of m.attachments) {
            if (a.type === "image") {
              blocks.push({
                type: "image",
                source: { type: "base64", media_type: (a.mimeType ?? "image/jpeg") as Anthropic.Base64ImageSource["media_type"], data: a.content },
              });
            } else if (a.type === "pdf") {
              blocks.push({
                type: "document",
                source: { type: "base64", media_type: "application/pdf", data: a.content },
              } as Anthropic.ContentBlockParam);
            } else {
              // Texto extraído (Excel, Word, txt…)
              blocks.push({ type: "text", text: `[Arquivo: ${a.filename}]\n\n${a.content}` });
            }
          }
          if (m.content.trim()) blocks.push({ type: "text", text: m.content });
          return { role: "user" as const, content: blocks };
        });
        // ctx compartilhado: selecionar_branch fixa a branch p/ as próximas tools do mesmo turno.
        const ctx = { branch };

        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          const ms = client.messages.stream({
            model: MODEL,
            max_tokens: 4096,
            system,
            messages: convo,
            tools,
          });

          ms.on("text", (delta) => emit({ type: "text", delta }));

          const final = await ms.finalMessage();
          convo.push({ role: "assistant", content: final.content });

          // Registra o consumo real desta rodada (tokens de input + output).
          recordUsage({
            branch,
            model: MODEL,
            inputTokens: final.usage?.input_tokens ?? 0,
            outputTokens: final.usage?.output_tokens ?? 0,
          }).catch(() => {});

          const toolUses = final.content.filter(
            (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
          );

          if (final.stop_reason !== "tool_use" || toolUses.length === 0) break;

          const results: Anthropic.ToolResultBlockParam[] = [];
          for (const tu of toolUses) {
            emit({ type: "tool_start", id: tu.id, name: tu.name, input: tu.input });
            let result: unknown;
            try {
              result = await executeTool(tu.name, tu.input as Record<string, unknown>, ctx);
            } catch (e) {
              result = { ok: false, error: e instanceof Error ? e.message : String(e) };
            }
            emit({ type: "tool_result", id: tu.id, name: tu.name, result });
            results.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(result) });
          }
          convo.push({ role: "user", content: results });
        }

        emit({ type: "done" });
      } catch (e) {
        emit({ type: "error", message: e instanceof Error ? e.message : String(e) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
