import Anthropic from "@anthropic-ai/sdk";
import { TOOLS, executeTool } from "@/lib/agent/tools";
import { buildSystemPrompt } from "@/lib/agent/prompt";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Seleciona a API key conforme o branch (com fallback para a key do orquestrador). */
function keyFor(workspace: string): string | undefined {
  if (workspace === "dux") return process.env.ANTHROPIC_API_KEY_DUX || process.env.ANTHROPIC_API_KEY;
  if (workspace === "sheep") return process.env.ANTHROPIC_API_KEY_SHEEP || process.env.ANTHROPIC_API_KEY;
  return process.env.ANTHROPIC_API_KEY;
}

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
const MAX_TOOL_ROUNDS = 8;

export async function POST(request: Request) {
  const { workspace = "pessoal", messages = [] } = await request.json();

  const apiKey = keyFor(workspace);
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "no_key", message: "ANTHROPIC_API_KEY não configurada no .env.local" }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  const client = new Anthropic({ apiKey });
  const system = buildSystemPrompt(workspace);
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
            max_tokens: 2048,
            system,
            messages: convo,
            tools: TOOLS,
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
              result = await executeTool(tu.name, tu.input as Record<string, unknown>);
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
