import type { ThumbnailAspectRatioValue } from "../utils/validation.js";

const POLLINATIONS_PROVIDER_NAME = "Pollinations AI";
const DEFAULT_IMAGE_MODEL = "flux";
const DEFAULT_BASE_URL = "https://gen.pollinations.ai";
const aspectRatioDimensions: Record<
  ThumbnailAspectRatioValue,
  { width: number; height: number }
> = {
  "16:9": { width: 1280, height: 720 },
  "1:1": { width: 1024, height: 1024 },
  "9:16": { width: 720, height: 1280 },
};

export class ImageGenerationError extends Error {
  status: number;
  retryAfterSeconds?: number;
  providerStatus?: string;

  constructor(
    message: string,
    status: number,
    retryAfterSeconds?: number,
    providerStatus?: string,
  ) {
    super(message);
    this.name = "ImageGenerationError";
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
    this.providerStatus = providerStatus;
  }
}

const getRetryAfterSeconds = (retryAfterHeader: string | null) => {
  if (!retryAfterHeader) {
    return undefined;
  }

  const seconds = Number.parseInt(retryAfterHeader, 10);
  return Number.isFinite(seconds) ? seconds : undefined;
};

const resolveBaseUrl = () =>
  (process.env.POLLINATIONS_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");

export const resolveImageProviderName = () => POLLINATIONS_PROVIDER_NAME;

export const resolveImageModel = () =>
  process.env.POLLINATIONS_IMAGE_MODEL?.trim() || DEFAULT_IMAGE_MODEL;

const buildImageUrl = (
  prompt: string,
  aspectRatio: ThumbnailAspectRatioValue,
  model: string,
) => {
  const { width, height } = aspectRatioDimensions[aspectRatio];
  const url = new URL(`/image/${encodeURIComponent(prompt)}`, resolveBaseUrl());

  url.searchParams.set("model", model);
  url.searchParams.set("width", width.toString());
  url.searchParams.set("height", height.toString());
  url.searchParams.set("nologo", "true");

  if (process.env.POLLINATIONS_API_KEY?.trim()) {
    url.searchParams.set("key", process.env.POLLINATIONS_API_KEY.trim());
  }

  return url;
};

const getErrorMessage = async (response: Response) => {
  const contentType = response.headers.get("content-type") || "";

  try {
    if (contentType.includes("application/json")) {
      const payload = (await response.json()) as {
        error?: string;
        message?: string;
      };

      return payload.message || payload.error || response.statusText;
    }

    const text = (await response.text()).trim();
    return text || response.statusText;
  } catch {
    return response.statusText || "Image generation failed";
  }
};

export const generateImage = async ({
  prompt,
  aspectRatio,
}: {
  prompt: string;
  aspectRatio: ThumbnailAspectRatioValue;
}) => {
  const model = resolveImageModel();
  const response = await fetch(buildImageUrl(prompt, aspectRatio, model), {
    headers: {
      Accept: "image/*",
    },
  });
  const retryAfterSeconds = getRetryAfterSeconds(
    response.headers.get("retry-after"),
  );

  if (!response.ok) {
    const message = await getErrorMessage(response);

    throw new ImageGenerationError(
      message || "Image generation failed",
      response.status,
      retryAfterSeconds,
      response.status === 429 ? "RATE_LIMITED" : undefined,
    );
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.startsWith("image/")) {
    const message = await getErrorMessage(response);

    throw new ImageGenerationError(
      message || "Image provider did not return an image",
      502,
      retryAfterSeconds,
      "INVALID_IMAGE_RESPONSE",
    );
  }

  return {
    imageBuffer: Buffer.from(await response.arrayBuffer()),
    model,
    provider: POLLINATIONS_PROVIDER_NAME,
  };
};
