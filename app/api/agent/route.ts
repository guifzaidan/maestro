import Anthropic from "@anthropic-ai/sdk";
import { buildTools, executeTool } from "@/lib/agent/tools";
import { buildSystemPrompt } from "@/lib/agent/prompt";
import { getBranchToken } from "@/lib/db/branches";
import { BRANCH_IDS } from "@/lib/theme";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Seleciona a API key da branch. Prioridade: token salvo no banco (Configurações
 * → Branchs) → env por branch → env global do orquestrador.
 */
async function keyFor(branch: string): Promise<string | undefined> {
  const dbToken = await getBranchToken(branch);
  if (dbToken) return dbToken;
  if (branch === BRANCH_IDS.dux) return process.env.ANTHROPIC_API_KEY_DUX || process.env.ANTHROPIC_API_KEY;
  if (branch === BRANCH_IDS.sheep) return process.env.ANTHROPIC_API_KEY_SHEEP || process.env.ANTHROPIC_API_KEY;
  return process.env.ANTHROPIC_API_KEY;
}

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
const MAX_TOOL_ROUNDS = 8;

export async function POST(request: Request) {
  const { branch = BRANCH_IDS.pessoal, messages = [] } = await request.json();

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
        const convo: Anthropic.MessageParam[] = messages;

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

          const toolUses = final.content.filter(
            (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
          );

          if (final.stop_reason !== "tool_use" || toolUses.length === 0) break;

          const results: Anthropic.ToolResultBlockParam[] = [];
          for (const tu of toolUses) {
            emit({ type: "tool_start", id: tu.id, name: tu.name, input: tu.input });
            let result: unknown;
            try {
              result = await executeTool(tu.name, tu.input as Record<string, unknown>, { branch });
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
