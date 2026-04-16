import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const connectDB = async () => {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI not found");
    }

    await mongoose.connect(process.env.MONGODB_URI, {
      dbName: "mydb",
      serverSelectionTimeoutMS: 5000 // 🔥 VERY IMPORTANT
    });

    console.log("MongoDB Connected ✅");

  } catch (error) {
    console.error("MongoDB connection error ❌:", error);
    process.exit(1);
  }
};

export default connectDB;