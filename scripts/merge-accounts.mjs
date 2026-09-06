/**
 * Merge one user account into another.
 *
 * Use when the same person ended up with two accounts (for example a typo'd
 * or differently-capitalised email on a second device) and their attendance
 * is split between them. All attendance records from SOURCE are moved to
 * TARGET, then the SOURCE user is deleted so it can't be logged into again.
 *
 * Dry run (prints the plan, changes nothing):
 *   node scripts/merge-accounts.mjs <source-email> <target-email>
 * Apply:
 *   node scripts/merge-accounts.mjs <source-email> <target-email> --yes
 *
 * When both accounts have a record for the same date, the TARGET's record is
 * kept if it has a check-in; otherwise the SOURCE's record replaces it.
 * Reads MONGODB_URI from the environment or .env.local.
 */
import fs from "node:fs";
import { MongoClient } from "mongodb";

function loadMongoUri() {
  if (process.env.MONGODB_URI) return process.env.MONGODB_URI;
  try {
    const env = fs.readFileSync(".env.local", "utf8");
    const match = env.match(/^MONGODB_URI=(.*)$/m);
    if (match) return match[1].trim().replace(/^["']|["']$/g, "");
  } catch {
    // fall through
  }
  throw new Error("MONGODB_URI is not set and .env.local has no value");
}

const [sourceArg, targetArg, ...flags] = process.argv.slice(2);
const apply = flags.includes("--yes");
if (!sourceArg || !targetArg) {
  console.error(
    "Usage: node scripts/merge-accounts.mjs <source-email> <target-email> [--yes]"
  );
  process.exit(1);
}

const norm = (e) => e.trim().toLowerCase();
const escapeRegex = (v) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const byEmail = (email) => ({
  email: { $regex: `^${escapeRegex(norm(email))}$`, $options: "i" },
});

const client = new MongoClient(loadMongoUri());
try {
  await client.connect();
  const db = client.db("attendance_system");
  const users = db.collection("users");
  const attendance = db.collection("attendance");

  const source = await users.findOne(byEmail(sourceArg));
  const target = await users.findOne(byEmail(targetArg));
  if (!source) throw new Error(`No account found for ${sourceArg}`);
  if (!target) throw new Error(`No account found for ${targetArg}`);
  if (source._id.equals(target._id)) {
    throw new Error("Source and target are the same account");
  }

  const sourceId = source._id.toString();
  const targetId = target._id.toString();

  const sourceRecords = await attendance.find({ userId: sourceId }).toArray();
  const targetDates = new Map(
    (await attendance.find({ userId: targetId }).toArray()).map((r) => [
      r.date,
      r,
    ])
  );

  const moves = [];
  const replaces = [];
  const drops = [];
  for (const rec of sourceRecords) {
    const clash = targetDates.get(rec.date);
    if (!clash) moves.push(rec);
    else if (clash.checkInTime) drops.push(rec);
    else replaces.push({ source: rec, target: clash });
  }

  const dates = (list) => list.map((r) => r.date).join(", ") || "-";
  console.log(
    `Source: ${source.email} (${sourceId}) — ${sourceRecords.length} record(s)`
  );
  console.log(
    `Target: ${target.email} (${targetId}) — ${targetDates.size} record(s)`
  );
  console.log(`  move    ${moves.length}: ${dates(moves)}`);
  console.log(
    `  replace ${replaces.length}: ${dates(replaces.map((r) => r.source))}`
  );
  console.log(
    `  drop    ${drops.length} (target already has a check-in): ${dates(drops)}`
  );
  console.log(`  then delete user ${source.email}`);

  if (!apply) {
    console.log("\nDry run — nothing changed. Re-run with --yes to apply.");
  } else {
    for (const rec of moves) {
      await attendance.updateOne(
        { _id: rec._id },
        { $set: { userId: targetId } }
      );
    }
    for (const { source: rec, target: clash } of replaces) {
      await attendance.deleteOne({ _id: clash._id });
      await attendance.updateOne(
        { _id: rec._id },
        { $set: { userId: targetId } }
      );
    }
    for (const rec of drops) {
      await attendance.deleteOne({ _id: rec._id });
    }
    await db.collection("password_resets").deleteMany({ userId: source._id });
    await users.deleteOne({ _id: source._id });
    console.log(
      "\nDone. Log out and back in as the target account on every device."
    );
  }
} finally {
  await client.close();
}
