import { Request, Response } from 'express';
import Thumbnail from '../models/Thumbnail.js';

// Fix: extend session type inside this file
import "express-session";
import { HarmBlockThreshold, HarmCategory } from '@google/genai';
import ai from '../configs/ai.js';
import path from 'node:path';
import fs from 'node:fs';
import { v2 as cloudinary } from 'cloudinary';

declare module "express-session" {
  interface SessionData {
    userId?: string;
  }
}

// 🔥 Cloudinary config (IMPORTANT)
cloudinary.config({
  cloud_name: process.env.CLOUD_NAME,
  api_key: process.env.CLOUD_API_KEY,
  api_secret: process.env.CLOUD_API_SECRET
});

const stylePrompts = {
  'Bold & Graphic': 'eye-catching thumbnail, bold typography, vibrant colors, expressive facial reaction, dramatic lighting, high contrast, click-worthy composition, professional style',
  'Tech/Futuristic': 'futuristic thumbnail, sleek modern design, digital UI elements, glowing accents, holographic effects, cyber-tech aesthetic, sharp lighting, high-tech atmosphere',
  'Minimalist': 'minimalist thumbnail, clean layout, simple shapes, limited color palette, plenty of negative space, modern flat design, clear focal point',
  'Photorealistic': 'photorealistic thumbnail, ultra-realistic lighting, natural skin tones, candid moment, DSLR-style photography, lifestyle realism, shallow depth of field',
  'Illustrated': 'illustrated thumbnail, custom digital illustration, stylized characters, bold outlines, vibrant colors, creative cartoon or vector art style'
};

const colorSchemeDescriptions = {
  vibrant: 'vibrant and energetic colors, high saturation, bold contrasts, eye-catching palette',
  sunset: 'warm sunset tones, orange pink and purple hues, soft gradients, cinematic glow',
  forest: 'natural green tones, earthy colors, calm and organic palette, fresh atmosphere',
  neon: 'neon glow effects, electric blues and pinks, cyberpunk lighting, high contrast glow',
  purple: 'purple-dominant color palette, magenta and violet tones, modern and stylish mood',
  monochrome: 'black and white color scheme, high contrast, dramatic lighting, timeless aesthetic',
  ocean: 'cool blue and teal tones, aquatic color palette, fresh and clean atmosphere',
  pastel: 'soft pastel colors, low saturation, gentle tones, calm and friendly aesthetic'
};

export const generateThumbnail = async (req: Request, res: Response) => {
  try {
    const userId = req.session?.userId;

    // ✅ Auth check
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { 
      title, 
      prompt: user_prompt, 
      style, 
      aspect_ratio,
      color_scheme 
    } = req.body;

    // ✅ Save initial DB record
    const thumbnail = await Thumbnail.create({
      userId,
      title,
      prompt_used: user_prompt,
      user_prompt,
      style,
      aspect_ratio,
      color_scheme,
      isGenerating: true
    });

    // ✅ AI MODEL (image)
   const model = 'gemini-1.5-flash';

    let prompt = `Create a ${stylePrompts[style as keyof typeof stylePrompts]} for: "${title}"`;

    if (color_scheme) {
      prompt += ` Use a ${colorSchemeDescriptions[color_scheme as keyof typeof colorSchemeDescriptions]} color scheme.`;
    }

    if (user_prompt) {
      prompt += ` Additional details: ${user_prompt}.`;
    }

    prompt += ` The thumbnail should be ${aspect_ratio}, visually stunning, and designed to maximize click-through rate.`;

    // ✅ Generate Image
    const response: any = await ai.models.generateContent({
      model,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        responseModalities: ['IMAGE'],
        safetySettings: [
          { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
          { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        ]
      }
    });

    // ✅ Extract image
    const parts = response?.candidates?.[0]?.content?.parts;

    if (!parts) {
      throw new Error("No image returned from AI");
    }

    let imageBuffer: Buffer | null = null;

    for (const part of parts) {
      if (part.inlineData) {
        imageBuffer = Buffer.from(part.inlineData.data, 'base64');
      }
    }

    if (!imageBuffer) {
      throw new Error("Image data not found");
    }

    // ✅ Save image locally
    const filename = `thumbnail-${Date.now()}.png`;
    const filePath = path.join('images', filename);

    fs.mkdirSync('images', { recursive: true });
    fs.writeFileSync(filePath, imageBuffer);

    // ✅ Upload to Cloudinary
    const uploadResult = await cloudinary.uploader.upload(filePath, {
      resource_type: 'image'
    });

    // ✅ Update DB
    thumbnail.image_url = uploadResult.secure_url;
    thumbnail.isGenerating = false;
    await thumbnail.save();

    // ✅ Remove local file
    fs.unlinkSync(filePath);

    // ✅ Final response
    return res.json({
      message: "Thumbnail Generated Successfully",
      image_url: uploadResult.secure_url,
      thumbnail
    });

  } catch (error: any) {
    console.error(error);
    return res.status(500).json({
      message: error.message
    });
  }
};

// ✅ Delete Thumbnail
export const deleteThumbnail = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { userId } = req.session;

    await Thumbnail.findByIdAndDelete({ _id: id, userId });

    return res.json({ message: 'Thumbnail deleted successfully' });

  } catch (error: any) {
    console.log(error);
    return res.status(500).json({ message: error.message });
  }
};