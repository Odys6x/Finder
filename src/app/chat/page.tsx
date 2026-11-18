import type { Metadata } from "next";
import { Suspense } from "react";
import { ChatClient } from "@/components/ChatClient";

export const metadata: Metadata = { title: "Ask AI" };

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="card min-h-[100dvh] animate-pulse" />}>
      <ChatClient />
    </Suspense>
  );
}
