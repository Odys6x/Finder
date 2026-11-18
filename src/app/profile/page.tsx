import type { Metadata } from "next";
import { ProfileForm } from "@/components/ProfileForm";

export const metadata: Metadata = { title: "My profile" };

export default function ProfilePage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My profile</h1>
        <p className="mt-1 text-sm text-muted">
          Saved only on this device. We never ask for your child&apos;s name, NRIC or school.
        </p>
      </div>
      <ProfileForm />
    </div>
  );
}
