import dns from "node:dns";
import { MongoClient, Db } from "mongodb";

// Local network DNS fix, not needed in production
if (process.env.NODE_ENV !== "production") {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
}

let client: MongoClient | null = null;
let db: Db | null = null;

export async function getDb(): Promise<Db> {
  if (db) return db;

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not set in environment variables");
  }

  client = new MongoClient(uri);
  await client.connect();
  db = client.db(process.env.DB_NAME || "booknook");
  await db
    .collection("borrows")
    .createIndex({ bookId: 1, userEmail: 1 }, { unique: true });
  console.log("Connected to MongoDB");
  return db;
}
