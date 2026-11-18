import type { Metadata } from "next";
import { ShortlistView } from "@/components/ShortlistView";

export const metadata: Metadata = { title: "Shortlist" };

export default function ShortlistPage() {
  return <ShortlistView />;
}
