import "server-only";
import Groq from "groq-sdk";
import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionTool,
} from "groq-sdk/resources/chat/completions";
import { SYSTEM_PROMPT } from "./prompt";
import { runTool, TOOLS, type ToolContext } from "./tools";

/**
 * Tool-use loop for Groq's OpenAI-compatible Chat Completions API. Same tools, system
 * prompt and FAQ as the Claude path; only the wire format differs. Guardrails are
 * applied by the caller on the final text, so they cover every provider.
 */

const GROQ_TOOLS: ChatCompletionTool[] = TOOLS.map((t) => ({
  type: "function",
  function: {
    name: t.name,
    description: t.description ?? "",
    parameters: t.input_schema as unknown as Record<string, unknown>,
  },
}));

const MAX_TOOL_ROUNDS = 5;

export async function runGroqLoop(
  client: Groq,
  model: string,
  history: { role: "user" | "assistant"; content: string }[],
  contextBlock: string,
  ctx: ToolContext,
  statusLabel: (tool: string) => string,
): Promise<string> {
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.slice(0, -1).map((t) => ({ role: t.role, content: t.content }) as ChatCompletionMessageParam),
    { role: "user", content: `${contextBlock}\n\n${history[history.length - 1].content}` },
  ];

  let finalText = "";
  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const lastRound = round === MAX_TOOL_ROUNDS;
    const stream = await client.chat.completions.create({
      model,
      messages,
      tools: GROQ_TOOLS,
      // On the last round force a text answer so the reply is never empty.
      tool_choice: lastRound ? "none" : "auto",
      temperature: 0.2, // Groq recommends 0.0–0.5 for tool calling
      max_completion_tokens: 4000,
      stream: true,
    });

    let text = "";
    const calls: { id: string; name: string; args: string }[] = [];
    let finish: string | null = null;
    for await (const chunk of stream) {
      const choice = chunk.choices[0];
      if (!choice) continue;
      const d = choice.delta;
      if (d.content) {
        text += d.content;
        ctx.emit({ type: "text", delta: d.content });
      }
      // Tool calls arrive in fragments; merge them by index.
      for (const tc of d.tool_calls ?? []) {
        const i = tc.index ?? calls.length;
        calls[i] ??= { id: "", name: "", args: "" };
        if (tc.id) calls[i].id = tc.id;
        if (tc.function?.name) calls[i].name += tc.function.name;
        if (tc.function?.arguments) calls[i].args += tc.function.arguments;
      }
      if (choice.finish_reason) finish = choice.finish_reason;
    }
    finalText += text;

    const toolCalls = calls.filter(Boolean);
    if (toolCalls.length === 0 || lastRound || finish === "length") break;

    const assistantCalls: ChatCompletionMessageToolCall[] = toolCalls.map((c, i) => ({
      id: c.id || `call_${round}_${i}`,
      type: "function",
      function: { name: c.name, arguments: c.args || "{}" },
    }));
    messages.push({ role: "assistant", content: text || null, tool_calls: assistantCalls });
    ctx.emit({ type: "status", message: toolCalls.map((c) => statusLabel(c.name)).join(" · ") });

    const results = await Promise.all(
      assistantCalls.map(async (c) => {
        let input: unknown;
        try {
          input = JSON.parse(c.function.arguments);
        } catch {
          return { id: c.id, content: "Invalid JSON arguments. Retry with valid JSON.", isError: true };
        }
        try {
          const r = await runTool(c.function.name, input, ctx);
          return { id: c.id, content: r.content, isError: r.isError };
        } catch (e) {
          return { id: c.id, content: `Tool failed: ${(e as Error).message}`, isError: true };
        }
      }),
    );
    for (const r of results) {
      messages.push({ role: "tool", tool_call_id: r.id, content: r.isError ? `ERROR: ${r.content}` : r.content });
    }
    if (text) {
      ctx.emit({ type: "text", delta: "\n\n" });
      finalText += "\n\n";
    }
  }
  return finalText;
}
