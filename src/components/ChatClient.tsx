"use client";
import dynamic from "next/dynamic";

/** Chat history lives in localStorage, so render the chat on the client only. */
export const ChatClient = dynamic(() => import("./ChatView").then((m) => m.ChatView), {
  ssr: false,
  loading: () => <div className="card min-h-[100dvh] animate-pulse" aria-busy />,
});
