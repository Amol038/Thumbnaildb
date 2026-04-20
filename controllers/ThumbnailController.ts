import { Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { v2 as cloudinary } from "cloudinary";
import ai from "../configs/ai.js";
import Thumbnail from "../models/Thumbnail.js";

const stylePrompts = {
  "Bold & Graphic":
    "eye-catching YouTube thumbnail, bold typography, vibrant colors, expressive facial reaction, dramatic lighting, high contrast, click-worthy composition, professional style",
  "Tech/Futuristic":
    "futuristic YouTube thumbnail, sleek modern design, digital UI elements, glowing accents, holographic effects, cyber-tech aesthetic, sharp lighting, high-tech atmosphere",
  Minimalist:
    "minimalist YouTube thumbnail, clean layout, simple shapes, limited color palette, plenty of negative space, modern flat design, clear focal point",
  Photorealistic:
    "photorealistic YouTube thumbnail, ultra-realistic lighting, natural skin tones, candid moment, DSLR-style photography, lifestyle realism, shallow depth of field",
  Illustrated:
    "illustrated YouTube thumbnail, custom digital illustration, stylized characters, bold outlines, vibrant colors, creative cartoon or vector art style",
} as const;

const colorSchemeDescriptions = {
  vibrant:
    "vibrant and energetic colors, high saturation, bold contrasts, eye-catching palette",
  sunset:
    "warm sunset tones, orange pink and purple hues, soft gradients, cinematic glow",
  forest:
    "natural green tones, earthy colors, calm and organic palette, fresh atmosphere",
  neon:
    "neon glow effects, electric blues and pinks, cyberpunk lighting, high contrast glow",
  purple:
    "purple-dominant color palette, magenta and violet tones, modern and stylish mood",
  monochrome:
    "black and white color scheme, high contrast, dramatic lighting, timeless aesthetic",
  ocean:
    "cool blue and teal tones, aquatic color palette, fresh and clean atmosphere",
  pastel:
    "soft pastel colors, low saturation, gentle tones, calm and friendly aesthetic",
} as const;

type ThumbnailStyleKey = keyof typeof stylePrompts;
type ColorSchemeKey = keyof typeof colorSchemeDescriptions;
type AspectRatio = "16:9" | "1:1" | "9:16";
type GeminiErrorPayload = {
  error?: {
    code?: number;
    message?: string;
    status?: string;
    details?: Array<{
      "@type"?: string;
      retryDelay?: string;
    }>;
  };
};

const currentFilePath = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFilePath);
const validAspectRatios = new Set<AspectRatio>(["16:9", "1:1", "9:16"]);
const imagesDirectory = path.resolve(currentDirectory, "../images");
const imageModelAliases: Record<string, string> = {
  "gemini-2.5-flash-preview-image": "gemini-2.5-flash-image",
  "gemini-2.5-flash-image-preview": "gemini-2.5-flash-image",
};
const hasCloudinaryConfig = Boolean(
  process.env.CLOUD_NAME &&
    process.env.CLOUD_API_KEY &&
    process.env.CLOUD_API_SECRET,
);

if (hasCloudinaryConfig) {
  cloudinary.config({
    cloud_name: process.env.CLOUD_NAME,
    api_key: process.env.CLOUD_API_KEY,
    api_secret: process.env.CLOUD_API_SECRET,
  });
}

const buildPrompt = (
  title: string,
  style: ThumbnailStyleKey,
  aspectRatio: AspectRatio,
  colorScheme?: ColorSchemeKey,
  userPrompt?: string,
) => {
  let prompt = `Create a ${stylePrompts[style]} for this YouTube video title: "${title}".`;

  if (colorScheme) {
    prompt += ` Use a ${colorSchemeDescriptions[colorScheme]} color scheme.`;
  }

  if (userPrompt) {
    prompt += ` Additional details: ${userPrompt}.`;
  }

  prompt += ` Keep the composition optimized for a ${aspectRatio} frame and make it visually striking for a high click-through rate.`;
  prompt +=
    " Return a finished thumbnail image only, with no mockups, borders, watermarks, or surrounding UI.";

  return prompt;
};

const resolveImageModel = () => {
  const configuredModel =
    process.env.GEMINI_IMAGE_MODEL?.trim() || "gemini-2.5-flash-image";

  return imageModelAliases[configuredModel] ?? configuredModel;
};

const buildPublicImageUrl = (req: Request, filename: string) => {
  const publicServerUrl = process.env.PUBLIC_SERVER_URL?.replace(/\/$/, "");
  if (publicServerUrl) {
    return `${publicServerUrl}/images/${filename}`;
  }

  return `${req.protocol}://${req.get("host")}/images/${filename}`;
};

const tryParseGeminiPayload = (value: string): GeminiErrorPayload | null => {
  try {
    return JSON.parse(value) as GeminiErrorPayload;
  } catch {
    return null;
  }
};

const getRetryAfterSeconds = (payload: GeminiErrorPayload | null) => {
  const retryDelay = payload?.error?.details?.find(
    (detail) => detail["@type"] === "type.googleapis.com/google.rpc.RetryInfo",
  )?.retryDelay;

  if (!retryDelay) {
    return undefined;
  }

  const seconds = Number.parseFloat(retryDelay.replace(/s$/, ""));
  return Number.isFinite(seconds) ? Math.ceil(seconds) : undefined;
};

const normalizeGenerationError = (error: unknown, model: string) => {
  const status =
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number"
      ? error.status
      : 500;

  const errorMessage =
    error instanceof Error ? error.message : "Unable to generate thumbnail";
  const payload =
    error instanceof Error ? tryParseGeminiPayload(error.message) : null;
  const providerStatus = payload?.error?.status;
  const retryAfterSeconds = getRetryAfterSeconds(payload);

  if (status === 429 || providerStatus === "RESOURCE_EXHAUSTED") {
    let message =
      "Gemini image generation quota is exhausted for this API key/project.";

    if (retryAfterSeconds) {
      message += ` Retry in about ${retryAfterSeconds} seconds.`;
    }

    message +=
      " If this keeps happening, switch to a billed Gemini project or wait for your quota window to reset.";

    return {
      status: 429,
      message,
      model,
      retryAfterSeconds,
      providerStatus: providerStatus ?? "RESOURCE_EXHAUSTED",
    };
  }

  return {
    status,
    message: payload?.error?.message || errorMessage,
    model,
    retryAfterSeconds,
    providerStatus,
  };
};

export const generateThumbnail = async (req: Request, res: Response) => {
  let localFilePath: string | null = null;
  let keepLocalFile = false;
  const model = resolveImageModel();

  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const {
      title,
      prompt: rawUserPrompt,
      style,
      aspect_ratio: rawAspectRatio,
      color_scheme: rawColorScheme,
    } = req.body as {
      title?: string;
      prompt?: string;
      style?: string;
      aspect_ratio?: AspectRatio;
      color_scheme?: string;
    };

    const normalizedTitle = title?.trim();
    const userPrompt = rawUserPrompt?.trim();
    const aspectRatio = rawAspectRatio ?? "16:9";

    if (!normalizedTitle) {
      return res.status(400).json({ message: "Title is required" });
    }

    if (!style || !(style in stylePrompts)) {
      return res.status(400).json({ message: "Invalid thumbnail style" });
    }

    if (!validAspectRatios.has(aspectRatio)) {
      return res.status(400).json({ message: "Invalid aspect ratio" });
    }

    if (rawColorScheme && !(rawColorScheme in colorSchemeDescriptions)) {
      return res.status(400).json({ message: "Invalid color scheme" });
    }

    const selectedStyle = style as ThumbnailStyleKey;
    const selectedColorScheme = rawColorScheme as ColorSchemeKey | undefined;
    const prompt = buildPrompt(
      normalizedTitle,
      selectedStyle,
      aspectRatio,
      selectedColorScheme,
      userPrompt,
    );

    const response = await ai.models.generateContent({
      model,
      contents: prompt,
    });

    const parts = response.candidates?.[0]?.content?.parts;
    if (!parts) {
      throw new Error("No image returned from Gemini");
    }

    const imagePart = parts.find((part) => part.inlineData?.data);
    if (!imagePart?.inlineData?.data) {
      throw new Error("Gemini did not return image data");
    }

    const imageBuffer = Buffer.from(imagePart.inlineData.data, "base64");
    const filename = `thumbnail-${Date.now()}.png`;

    fs.mkdirSync(imagesDirectory, { recursive: true });
    localFilePath = path.join(imagesDirectory, filename);
    fs.writeFileSync(localFilePath, imageBuffer);

    let imageUrl = buildPublicImageUrl(req, filename);

    if (hasCloudinaryConfig) {
      const uploadResult = await cloudinary.uploader.upload(localFilePath, {
        folder: "youtube-thumbnails",
        resource_type: "image",
      });

      imageUrl = uploadResult.secure_url;
    } else {
      keepLocalFile = true;
    }

    const thumbnail = await Thumbnail.create({
      userId,
      title: normalizedTitle,
      prompt_used: prompt,
      user_prompt: userPrompt,
      style: selectedStyle,
      aspect_ratio: aspectRatio,
      color_scheme: selectedColorScheme,
      image_url: imageUrl,
      isGenerating: false,
    });

    return res.json({
      message: "Thumbnail generated successfully",
      image_url: imageUrl,
      thumbnail,
    });
  } catch (error: unknown) {
    const normalizedError = normalizeGenerationError(error, model);

    if (normalizedError.status === 429) {
      console.warn(
        `Gemini quota exceeded for model ${normalizedError.model}. Retry after ${normalizedError.retryAfterSeconds ?? "unknown"} seconds.`,
      );
    } else {
      console.error("Thumbnail generation error:", error);
    }

    return res.status(normalizedError.status).json({
      message: normalizedError.message,
      model: normalizedError.model,
      retryAfterSeconds: normalizedError.retryAfterSeconds,
      providerStatus: normalizedError.providerStatus,
    });
  } finally {
    if (localFilePath && !keepLocalFile && fs.existsSync(localFilePath)) {
      fs.unlinkSync(localFilePath);
    }
  }
};

export const deleteThumbnail = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.session.userId;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const thumbnail = await Thumbnail.findOneAndDelete({ _id: id, userId });
    if (!thumbnail) {
      return res.status(404).json({ message: "Thumbnail not found" });
    }

    if (thumbnail.image_url) {
      try {
        const imagePathname = new URL(thumbnail.image_url).pathname;
        if (imagePathname.startsWith("/images/")) {
          const localImagePath = path.join(
            imagesDirectory,
            path.basename(imagePathname),
          );

          if (fs.existsSync(localImagePath)) {
            fs.unlinkSync(localImagePath);
          }
        }
      } catch {
        // Ignore invalid or remote URLs during local cleanup.
      }
    }

    return res.json({ message: "Thumbnail deleted successfully" });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Unable to delete thumbnail";

    console.error("Thumbnail delete error:", error);
    return res.status(500).json({ message });
  }
};
