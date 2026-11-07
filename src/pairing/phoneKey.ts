const FALLBACK_NAME = "phone";

/**
 * The comment that ends the phone key's line in authorized_keys, so the person can find it
 * there: "herdhand-<model>-<date the key was made>". The pairing script accepts only letters,
 * digits, ".", "_" and "-" in it.
 */
export function makePhoneKeyComment(model: string | undefined, createdAt: number): string {
  const name =
    (model ?? "")
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "") || FALLBACK_NAME;
  const date = new Date(createdAt).toISOString().slice(0, 10);
  return `herdhand-${name}-${date}`;
}
