import { Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { v2 as cloudinary } from "cloudinary";
import Thumbnail from "../models/Thumbnail.js";
import {
  ImageGenerationError,
  generateImage,
  resolveImageModel,
  resolveImageProviderName,
} from "../configs/ai.js";
import {
  type ThumbnailAspectRatioValue,
  type ThumbnailColorSchemeValue,
  type ThumbnailStyleValue,
  hasValidationErrors,
  validateThumbnailGenerationPayload,
} from "../utils/validation.js";

const stylePrompts: Record<ThumbnailStyleValue, string> = {
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
};

const colorSchemeDescriptions: Record<ThumbnailColorSchemeValue, string> = {
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
};

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
const imagesDirectory = path.resolve(currentDirectory, "../images");
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
  style: ThumbnailStyleValue,
  aspectRatio: ThumbnailAspectRatioValue,
  colorScheme?: ThumbnailColorSchemeValue,
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
  if (error instanceof ImageGenerationError) {
    if (error.status === 429) {
      let message = "Image generation is temporarily rate limited.";

      if (error.retryAfterSeconds) {
        message += ` Retry in about ${error.retryAfterSeconds} seconds.`;
      }

      message += " Please wait a bit and try again.";

      return {
        status: 429,
        message,
        model,
        retryAfterSeconds: error.retryAfterSeconds,
        providerStatus: error.providerStatus ?? "RATE_LIMITED",
      };
    }

    return {
      status: error.status,
      message: error.message,
      model,
      retryAfterSeconds: error.retryAfterSeconds,
      providerStatus: error.providerStatus,
    };
  }

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
    let message = "Image generation is temporarily rate limited.";

    if (retryAfterSeconds) {
      message += ` Retry in about ${retryAfterSeconds} seconds.`;
    }

    message += " Please wait a bit and try again.";

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
  const provider = resolveImageProviderName();

  try {
    const userId = req.session.userId;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const {
      errors,
      normalizedTitle,
      userPrompt,
      selectedStyle,
      selectedAspectRatio,
      selectedColorScheme,
    } = validateThumbnailGenerationPayload(req.body ?? {});

    if (hasValidationErrors(errors) || !selectedStyle) {
      return res.status(422).json({
        message: "Please correct the highlighted fields.",
        errors,
      });
    }

    const aspectRatio: ThumbnailAspectRatioValue = selectedAspectRatio;
    const prompt = buildPrompt(
      normalizedTitle,
      selectedStyle,
      aspectRatio,
      selectedColorScheme,
      userPrompt,
    );

    const generationResult = await generateImage({
      prompt,
      aspectRatio,
    });
    const filename = `thumbnail-${Date.now()}.png`;

    fs.mkdirSync(imagesDirectory, { recursive: true });
    localFilePath = path.join(imagesDirectory, filename);
    fs.writeFileSync(localFilePath, generationResult.imageBuffer);

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
        `${provider} rate limit reached for model ${normalizedError.model}. Retry after ${normalizedError.retryAfterSeconds ?? "unknown"} seconds.`,
      );

      if (normalizedError.retryAfterSeconds) {
        res.setHeader(
          "Retry-After",
          normalizedError.retryAfterSeconds.toString(),
        );
      }
    } else {
      console.error("Thumbnail generation error:", error);
    }

    return res.status(normalizedError.status).json({
      message: normalizedError.message,
      provider,
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
