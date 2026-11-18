import type { Metadata } from "next";
import { MatchView } from "@/components/MatchView";

export const metadata: Metadata = { title: "My matches" };

export default function MatchPage() {
  return <MatchView />;
}
