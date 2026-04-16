import { Request, Response } from 'express';
import Thumbnail from '../models/Thumbnail.js';

// Fix: extend session type inside this file
import "express-session";

declare module "express-session" {
  interface SessionData {
    userId?: string;
  }
}

export const generateThumbnail = async (req: Request, res: Response) => {
    try {
        const userId = req.session?.userId;

        // Auth check
        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }

        const { 
            title, 
            prompt: user_prompt, 
            style, 
            aspect_ratio,
            color_scheme, 
            text_overlay 
        } = req.body;

        const thumbnail = await Thumbnail.create({
            userId,
            title,
            prompt_used: user_prompt,
            user_prompt,
            style,
            aspect_ratio,
            color_scheme,
            text_overlay,
            isGenerating: true
        });

        return res.status(201).json({
            message: "Thumbnail generation started",
            data: thumbnail
        });

    } catch (error) {
        console.error(error);
        return res.status(500).json({
            message: "Something went wrong"
        });
    }
};