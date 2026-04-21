import mongoose, { Document } from "mongoose";
import {
    THUMBNAIL_ASPECT_RATIOS,
    THUMBNAIL_COLOR_SCHEMES,
    THUMBNAIL_PROMPT_MAX_LENGTH,
    THUMBNAIL_STYLES,
    THUMBNAIL_TITLE_MAX_LENGTH,
    THUMBNAIL_TITLE_MIN_LENGTH,
    type ThumbnailAspectRatioValue,
    type ThumbnailColorSchemeValue,
    type ThumbnailStyleValue,
} from "../utils/validation.js";

export interface IThumbnail extends Document{
    userId: string;
    title: string;
    description?: string;
    style: ThumbnailStyleValue;
    aspect_ratio?: ThumbnailAspectRatioValue;
    color_scheme?: ThumbnailColorSchemeValue;
    text_overlay?: boolean;
    image_url?: string;
    prompt_used?: string;
    user_prompt?: string;
    isGenerating?: boolean;
    createdAt?: Date;
    updatedAt?: Date;
}
const ThumbnailSchema = new mongoose.Schema<IThumbnail>(
    {
userId: { type: String, ref: 'User', required: true },
title: {
    type: String,
    required: true,
    trim: true,
    minlength: THUMBNAIL_TITLE_MIN_LENGTH,
    maxlength: THUMBNAIL_TITLE_MAX_LENGTH,
},
description: { type: String, trim: true },
style: { type: String, required: true, enum: [...THUMBNAIL_STYLES] },
aspect_ratio: { type: String, enum: [...THUMBNAIL_ASPECT_RATIOS], 
default: '16:9' },
color_scheme: { type: String, enum: [...THUMBNAIL_COLOR_SCHEMES] },
text_overlay: { type: Boolean, default: false },
image_url: { type: String, default: '' },
prompt_used: { type: String },
user_prompt: {
    type: String,
    trim: true,
    maxlength: THUMBNAIL_PROMPT_MAX_LENGTH,
},
isGenerating: { type: Boolean, default: true },
    },
    { timestamps: true }
)

const Thumbnail = mongoose.models.Thumbnail || mongoose.model<IThumbnail>('Thumbnail', ThumbnailSchema)

export default Thumbnail;
