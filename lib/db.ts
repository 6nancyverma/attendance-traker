import { MongoClient, Db } from "mongodb";

/**
 * Cache the Mongo connection on the Node.js global object so it survives
 * module reloads during `next dev` (avoids opening a new pool per request).
 */
type MongoCache = {
  client: MongoClient;
  db: Db;
  indexesReady: Promise<void>;
};

const globalForMongo = global as unknown as { _mongo?: MongoCache };

export async function connectToDatabase(): Promise<{ client: MongoClient; db: Db }> {
  if (globalForMongo._mongo) {
    const cached = globalForMongo._mongo;
    await cached.indexesReady;
    return { client: cached.client, db: cached.db };
  }

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error("MONGODB_URI is not defined");
  }

  const client = new MongoClient(mongoUri);
  await client.connect();

  const db = client.db("attendance_system");

  const indexesReady = createIndexes(db);

  globalForMongo._mongo = { client, db, indexesReady };

  await indexesReady;

  return { client, db };
}

async function createIndexes(db: Db) {
  try {
    const usersCollection = db.collection("users");
    await usersCollection.createIndex({ email: 1 }, { unique: true });

    const attendanceCollection = db.collection("attendance");
    await attendanceCollection.createIndex({ userId: 1 });
    await attendanceCollection.createIndex({ date: 1 });
    await attendanceCollection.createIndex(
      { userId: 1, date: 1 },
      { unique: true }
    );

    const passwordResetsCollection = db.collection("password_resets");
    await passwordResetsCollection.createIndex({ tokenHash: 1 });
    await passwordResetsCollection.createIndex({ userId: 1 });
    // Mongo drops these documents once expiresAt passes, so used and abandoned
    // reset requests clean themselves up.
    await passwordResetsCollection.createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0 }
    );
  } catch (error) {
    console.error("Error creating indexes:", error);
  }
}

export async function disconnectFromDatabase() {
  if (globalForMongo._mongo) {
    await globalForMongo._mongo.client.close();
    globalForMongo._mongo = undefined;
  }
}
