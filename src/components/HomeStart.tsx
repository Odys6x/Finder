"use client";
import Link from "next/link";
import { profileIsReady, useProfile } from "@/lib/client/store";

export function HomeStart() {
  const [profile, , hydrated] = useProfile();
  const ready = hydrated && profileIsReady(profile);
  return (
    <div className="mt-5 flex flex-wrap gap-3">
      {ready ? (
        <Link href="/match" className="btn-primary">
          See my matches →
        </Link>
      ) : (
        <Link href="/profile" className="btn-primary">
          Start — takes 1 minute
        </Link>
      )}
      <Link href="/schools" className="btn-ghost">
        Browse all schools
      </Link>
      <Link href="/chat" className="btn-ghost">
        Ask the AI
      </Link>
    </div>
  );
}
