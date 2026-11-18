/** Tiny text-matching helpers with no dependencies, safe for client bundles. */

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Does an interest phrase appear at a word start in any label? Case-insensitive. */
export function matchInterest(interest: string, labels: string[]): string | null {
  const i = norm(interest);
  if (!i) return null;
  const re = new RegExp(`\\b${i.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`);
  for (const l of labels) if (re.test(norm(l))) return l;
  return null;
}
