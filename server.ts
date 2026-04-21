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
const defaultAllowedOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];
const normalizeOrigin = (origin: string) => origin.trim().replace(/\/$/, "");
const allowedOrigins = Array.from(
  new Set(
    (process.env.CLIENT_URL
      ? process.env.CLIENT_URL.split(",")
      : defaultAllowedOrigins
    )
      .map(normalizeOrigin)
      .filter(Boolean),
  ),
);

if (!mongoUrl) {
  throw new Error("MONGODB_URI is required");
}

if (!sessionSecret) {
  throw new Error("SESSION_SECRET is required");
}

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(normalizeOrigin(origin))) {
        return callback(null, origin);
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

const getApiOverview = (host: string) => ({
  status: "ok",
  message: "Thumbnail backend API is running",
  baseUrl: host,
  routes: {
    health: "/",
    apiInfo: "/api",
    auth: {
      register: "POST /api/auth/register",
      login: "POST /api/auth/login",
      verify: "GET /api/auth/verify",
      logout: "POST /api/auth/logout",
    },
    thumbnails: {
      generate: "POST /api/thumbnail/generate",
      delete: "DELETE /api/thumbnail/delete/:id",
    },
    user: {
      profile: "GET /api/user/profile",
      updateProfile: "PATCH /api/user/profile",
      thumbnails: "GET /api/user/thumbnails",
      thumbnailById: "GET /api/user/thumbnail/:id",
    },
    contact: {
      submit: "POST /api/contact",
    },
    staticFiles: {
      images: "/images/:filename",
    },
  },
  gemini: {
    provider: "Google Gemini",
    imageModel: process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image",
    note: "Set GEMINI_API_KEY, GEMINI_IMAGE_MODEL, MONGODB_URI, SESSION_SECRET, and CLIENT_URL in backend .env.",
  },
});

app.get("/", (req, res) => {
  const host = `${req.protocol}://${req.get("host")}`;
  res.json(getApiOverview(host));
});

app.get("/api", (req, res) => {
  const host = `${req.protocol}://${req.get("host")}`;
  res.json(getApiOverview(host));
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
      console.log(`Allowed CORS origins: ${allowedOrigins.join(", ")}`);
    });
  } catch (error) {
    console.error("Server Error:", error);
  }
};

startServer();
