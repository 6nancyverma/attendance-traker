import type { Db, WithId, Document } from "mongodb";
import { escapeRegex, normalizeEmail } from "./email";

/**
 * Look a user up by email, ignoring case and surrounding whitespace.
 *
 * New accounts are stored normalised (see `normalizeEmail`), so the first
 * query is an indexed exact match. The regex fallback catches accounts that
 * were created before normalisation and still carry capitals.
 */
export async function findUserByEmail(
  db: Db,
  email: string
): Promise<WithId<Document> | null> {
  const users = db.collection("users");
  const normalized = normalizeEmail(email);

  const exact = await users.findOne({ email: normalized });
  if (exact) return exact;

  return users.findOne({
    email: { $regex: `^${escapeRegex(normalized)}$`, $options: "i" },
  });
}
