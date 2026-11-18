"use client";
import type { ChatEvent } from "../chat/tools";
import type { Profile } from "../types";

/**
 * Sends a conversation to /api/chat and calls `onEvent` for each streamed event.
 * Returns "limit" when the free questions are used up (HTTP 402).
 */
export async function streamChat(
  messages: { role: "user" | "assistant"; content: string }[],
  profile: Profile,
  onEvent: (e: ChatEvent) => void,
): Promise<"ok" | "limit" | "error"> {
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: messages.slice(-12), profile }),
    });
    if (res.status === 402) return "limit";
    if (!res.ok || !res.body) return "error";
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        if (line.trim()) onEvent(JSON.parse(line) as ChatEvent);
      }
    }
    return "ok";
  } catch {
    return "error";
  }
}
