import dotenv from "dotenv";
dotenv.config();

import cors from "cors";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import session from "express-session";
import MongoStore from "connect-mongo";
import connectDB from "./configs/db.js";
import AuthRouter from "./routes/AuthRoutes.js";
import ContactRouter from "./routes/ContactRoutes.js";
import ThumbnailRouter from "./routes/ThumbnailRoutes.js";
import UserRouter from "./routes/UserRoutes.js";

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFilePath);
const app = express();
const mongoUrl = process.env.MONGODB_URI;
const sessionSecret = process.env.SESSION_SECRET;
const allowedOrigins = process.env.CLIENT_URL
  ? process.env.CLIENT_URL
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
  : ["http://localhost:5173"];

if (!mongoUrl) {
  throw new Error("MONGODB_URI is required");
}

if (!sessionSecret) {
  throw new Error("SESSION_SECRET is required");
}

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Origin not allowed by CORS"));
    },
    credentials: true,
  }),
);

app.use(express.json());
app.use("/images", express.static(path.resolve(currentDirectory, "images")));

app.use(
  session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl,
    }),
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 },
  }),
);

app.get("/", (_req, res) => {
  res.send("Server is Live!");
});

app.use("/api/auth", AuthRouter);
app.use("/api/contact", ContactRouter);
app.use("/api/thumbnail", ThumbnailRouter);
app.use("/api/user", UserRouter);

const port = Number(process.env.PORT) || 3000;

const startServer = async () => {
  try {
    await connectDB();
    app.listen(port, () => {
      console.log(`Server running at http://localhost:${port}`);
    });
  } catch (error) {
    console.error("Server Error:", error);
  }
};

startServer();
