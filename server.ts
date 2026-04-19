import dotenv from "dotenv";
dotenv.config();

import express from 'express';
import cors from "cors";
import connectDB from './configs/db.js';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import AuthRouter from './routes/AuthRoutes.js';
import ThumbnailRouter from "./routes/ThumbnailRoutes.js";
import UserRouter from "./routes/UserRoutes.js";

const app = express();

// 🔍 DEBUG (remove later)
console.log("ENV CHECK:", process.env.MONGODB_URI);

app.use(cors({
    origin: ['http://localhost:5173'],
    credentials: true
}));

app.use(express.json());

app.use(session({
    secret: process.env.SESSION_SECRET as string,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGODB_URI,
    }),
    cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 },
    
}));

app.get('/', (req, res) => {
    res.send('Server is Live!');
});

app.use('/api/auth', AuthRouter);
app.use('/api/thumbnail',ThumbnailRouter)
app.use('/api/user',UserRouter)

const port = process.env.PORT || 3000;

const startServer = async () => {
    try {
        await connectDB();
        app.listen(port, () => {
            console.log(`Server running at http://localhost:${port}`);
        });
    } catch (err) {
        console.error("Server Error:", err);
    }
};

startServer();