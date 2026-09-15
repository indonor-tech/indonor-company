import mongoose from "mongoose";

const globalForMongoose = globalThis as typeof globalThis & {
  mongoConnection?: Promise<typeof mongoose>;
};

export async function connectMongo() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is not configured");
  }
  if (!globalForMongoose.mongoConnection) {
    globalForMongoose.mongoConnection = mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
    });
  }
  await globalForMongoose.mongoConnection;
}
