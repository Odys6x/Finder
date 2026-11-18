"use client";
import dynamic from "next/dynamic";

/** The chat thread lives in localStorage, so it renders on the client only. */
export const ChatHome = dynamic(() => import("./ChatApp").then((m) => m.ChatApp), {
  ssr: false,
  loading: () => (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-3 px-4 pt-[4.5rem]" aria-busy>
      <div className="h-24 w-4/5 animate-pulse rounded-3xl bg-card" />
      <div className="h-14 w-3/5 animate-pulse rounded-3xl bg-card" />
      <div className="min-h-[60dvh]" />
    </div>
  ),
});
