import type { NextRequest } from "next/server";
import { z } from "zod";
import { config } from "@/lib/config";
import { runChat } from "@/lib/chat/run";
import type { ChatEvent } from "@/lib/chat/tools";
import { parseProfile } from "@/lib/profile-schema";
import { getChatCount, getOrCreateAnonId, hasPass, incrementChatCount } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(4000) }))
    .min(1)
    .max(40),
  profile: z.unknown().optional(),
});

/** Streams newline-delimited JSON ChatEvents. */
export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const { messages } = parsed.data;
  if (messages[messages.length - 1].role !== "user") return Response.json({ error: "Last message must be from the user" }, { status: 400 });

  const paid = await hasPass();
  const anonId = await getOrCreateAnonId();
  let remaining = Infinity;
  if (!paid) {
    const used = await getChatCount(anonId);
    if (used >= config.free.chatMessages) {
      return Response.json({ error: "limit", remaining: 0 }, { status: 402 });
    }
    remaining = config.free.chatMessages - (await incrementChatCount(anonId));
  }

  // Keep the last 12 turns; older context is rarely needed and costs tokens.
  const history = messages.slice(-12);
  const profile = body_profile(parsed.data.profile);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: ChatEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        if (!paid) emit({ type: "limit", remaining: Math.max(0, remaining) });
        await runChat(history, profile, emit);
      } catch (err) {
        console.error("chat error", err);
        emit({ type: "error", message: "Sorry — the assistant is busy right now. Please try again in a moment." });
      } finally {
        emit({ type: "done" });
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function body_profile(raw: unknown) {
  return raw ? parseProfile(raw) : null;
}
