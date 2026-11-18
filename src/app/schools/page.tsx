import type { Metadata } from "next";
import { Suspense } from "react";
import { SchoolSearch } from "@/components/SchoolSearch";

export const metadata: Metadata = { title: "Find schools" };

export default function SchoolsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Secondary schools</h1>
        <p className="mt-1 text-sm text-muted">Filter by area, CCA, programme, subject and more. Free to use.</p>
      </div>
      <Suspense fallback={<div className="card min-h-[100dvh] animate-pulse" />}>
        <SchoolSearch />
      </Suspense>
    </div>
  );
}
