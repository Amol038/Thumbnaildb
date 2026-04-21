export const USER_NAME_MIN_LENGTH = 2;
export const USER_NAME_MAX_LENGTH = 50;
export const EMAIL_MAX_LENGTH = 254;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 72;
export const THUMBNAIL_TITLE_MIN_LENGTH = 3;
export const THUMBNAIL_TITLE_MAX_LENGTH = 100;
export const THUMBNAIL_PROMPT_MAX_LENGTH = 400;
export const THUMBNAIL_ASPECT_RATIOS = ["16:9", "1:1", "9:16"] as const;
export const THUMBNAIL_STYLES = [
  "Bold & Graphic",
  "Tech/Futuristic",
  "Minimalist",
  "Photorealistic",
  "Illustrated",
] as const;
export const THUMBNAIL_COLOR_SCHEMES = [
  "vibrant",
  "sunset",
  "forest",
  "neon",
  "purple",
  "monochrome",
  "ocean",
  "pastel",
] as const;
export const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ValidationErrors = Record<string, string>;
export type ThumbnailStyleValue = (typeof THUMBNAIL_STYLES)[number];
export type ThumbnailAspectRatioValue = (typeof THUMBNAIL_ASPECT_RATIOS)[number];
export type ThumbnailColorSchemeValue =
  (typeof THUMBNAIL_COLOR_SCHEMES)[number];

const normalizeSingleLineText = (value: unknown) =>
  typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";

const normalizeMultilineText = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const normalizeEmail = (value: unknown) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

export const hasValidationErrors = (errors: ValidationErrors) =>
  Object.keys(errors).length > 0;

export const validateRegisterPayload = (payload: {
  name?: unknown;
  email?: unknown;
  password?: unknown;
}) => {
  const normalizedName = normalizeSingleLineText(payload.name);
  const normalizedEmail = normalizeEmail(payload.email);
  const password = typeof payload.password === "string" ? payload.password : "";
  const errors: ValidationErrors = {};

  if (!normalizedName) {
    errors.name = "Name is required.";
  } else if (normalizedName.length < USER_NAME_MIN_LENGTH) {
    errors.name = `Name must be at least ${USER_NAME_MIN_LENGTH} characters.`;
  } else if (normalizedName.length > USER_NAME_MAX_LENGTH) {
    errors.name = `Name must be ${USER_NAME_MAX_LENGTH} characters or fewer.`;
  }

  if (!normalizedEmail) {
    errors.email = "Email is required.";
  } else if (normalizedEmail.length > EMAIL_MAX_LENGTH) {
    errors.email = `Email must be ${EMAIL_MAX_LENGTH} characters or fewer.`;
  } else if (!emailPattern.test(normalizedEmail)) {
    errors.email = "Enter a valid email address.";
  }

  if (!password) {
    errors.password = "Password is required.";
  } else if (password.length < PASSWORD_MIN_LENGTH) {
    errors.password =
      `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  } else if (password.length > PASSWORD_MAX_LENGTH) {
    errors.password =
      `Password must be ${PASSWORD_MAX_LENGTH} characters or fewer.`;
  }

  return {
    errors,
    normalizedName,
    normalizedEmail,
    password,
  };
};

export const validateLoginPayload = (payload: {
  email?: unknown;
  password?: unknown;
}) => {
  const normalizedEmail = normalizeEmail(payload.email);
  const password = typeof payload.password === "string" ? payload.password : "";
  const errors: ValidationErrors = {};

  if (!normalizedEmail) {
    errors.email = "Email is required.";
  } else if (normalizedEmail.length > EMAIL_MAX_LENGTH) {
    errors.email = `Email must be ${EMAIL_MAX_LENGTH} characters or fewer.`;
  } else if (!emailPattern.test(normalizedEmail)) {
    errors.email = "Enter a valid email address.";
  }

  if (!password) {
    errors.password = "Password is required.";
  } else if (password.length > PASSWORD_MAX_LENGTH) {
    errors.password =
      `Password must be ${PASSWORD_MAX_LENGTH} characters or fewer.`;
  }

  return {
    errors,
    normalizedEmail,
    password,
  };
};

export const validateThumbnailGenerationPayload = (payload: {
  title?: unknown;
  prompt?: unknown;
  style?: unknown;
  aspect_ratio?: unknown;
  color_scheme?: unknown;
}) => {
  const normalizedTitle = normalizeSingleLineText(payload.title);
  const userPrompt = normalizeMultilineText(payload.prompt);
  const rawStyle = normalizeSingleLineText(payload.style);
  const rawAspectRatio = normalizeSingleLineText(payload.aspect_ratio);
  const rawColorScheme = normalizeSingleLineText(payload.color_scheme);
  const selectedStyle = THUMBNAIL_STYLES.find((value) => value === rawStyle);
  const matchedAspectRatio = THUMBNAIL_ASPECT_RATIOS.find(
    (value) => value === rawAspectRatio,
  );
  const selectedAspectRatio =
    matchedAspectRatio ??
    THUMBNAIL_ASPECT_RATIOS[0];
  const selectedColorScheme = THUMBNAIL_COLOR_SCHEMES.find(
    (value) => value === rawColorScheme,
  );
  const errors: ValidationErrors = {};

  if (!normalizedTitle) {
    errors.title = "Title is required.";
  } else if (normalizedTitle.length < THUMBNAIL_TITLE_MIN_LENGTH) {
    errors.title =
      `Title must be at least ${THUMBNAIL_TITLE_MIN_LENGTH} characters.`;
  } else if (normalizedTitle.length > THUMBNAIL_TITLE_MAX_LENGTH) {
    errors.title =
      `Title must be ${THUMBNAIL_TITLE_MAX_LENGTH} characters or fewer.`;
  }

  if (userPrompt.length > THUMBNAIL_PROMPT_MAX_LENGTH) {
    errors.prompt =
      `Additional prompt details must be ${THUMBNAIL_PROMPT_MAX_LENGTH} characters or fewer.`;
  }

  if (!rawStyle) {
    errors.style = "Thumbnail style is required.";
  } else if (!selectedStyle) {
    errors.style = "Select a valid thumbnail style.";
  }

  if (rawAspectRatio && !matchedAspectRatio) {
    errors.aspect_ratio = "Select a valid aspect ratio.";
  }

  if (rawColorScheme && !selectedColorScheme) {
    errors.color_scheme = "Select a valid color scheme.";
  }

  return {
    errors,
    normalizedTitle,
    userPrompt,
    selectedStyle,
    selectedAspectRatio,
    selectedColorScheme,
  };
};
