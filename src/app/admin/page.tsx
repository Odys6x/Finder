import type { Metadata } from "next";
import { AdminDashboard } from "@/components/AdminDashboard";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };

export default function AdminPage() {
  return <AdminDashboard />;
}
