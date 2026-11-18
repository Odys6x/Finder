import Link from "next/link";

export default function NotFound() {
  return (
    <div className="card space-y-3 text-center">
      <h1 className="text-xl font-bold">Page not found</h1>
      <p className="text-sm text-muted">That school or page doesn&apos;t exist.</p>
      <Link href="/schools" className="btn-primary">
        Browse schools
      </Link>
    </div>
  );
}
