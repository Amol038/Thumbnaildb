import { Request, Response } from "express";
import Thumbnail from "../models/Thumbnail.js";
import User from "../models/User.js";

const getProfileStats = async (userId: string) => {
  const [thumbnailCount, generatingCount, latestThumbnail] = await Promise.all([
    Thumbnail.countDocuments({ userId }),
    Thumbnail.countDocuments({ userId, isGenerating: true }),
    Thumbnail.findOne({ userId }).sort({ createdAt: -1 }).select("createdAt"),
  ]);

  return {
    thumbnailCount,
    generatingCount,
    latestGenerationAt: latestThumbnail?.createdAt ?? null,
  };
};

export const getUsersThumbnails = async (req: Request, res: Response) => {
  try {
    const { userId } = req.session;

    const thumbnails = await Thumbnail.find({ userId }).sort({ createdAt: -1 });
    return res.json({ thumbnails });
  } catch (error: any) {
    console.log(error);
    return res.status(500).json({ message: error.message });
  }
};

export const getThumbnailbyId = async (req: Request, res: Response) => {
  try {
    const { userId } = req.session;
    const { id } = req.params;

    const thumbnail = await Thumbnail.findOne({ userId, _id: id });
    if (!thumbnail) {
      return res.status(404).json({ message: "Thumbnail not found" });
    }

    return res.json({ thumbnail });
  } catch (error: any) {
    console.log(error);
    return res.status(500).json({ message: error.message });
  }
};

export const getUserProfile = async (req: Request, res: Response) => {
  try {
    const { userId } = req.session;

    const user = await User.findById(userId).select("-password");
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const stats = await getProfileStats(user._id.toString());

    return res.json({ user, stats });
  } catch (error: any) {
    console.log(error);
    return res.status(500).json({ message: error.message });
  }
};

export const updateUserProfile = async (req: Request, res: Response) => {
  try {
    const { userId } = req.session;
    const { name, email } = req.body as {
      name?: string;
      email?: string;
    };

    const normalizedName = name?.trim();
    const normalizedEmail = email?.trim().toLowerCase();

    if (!normalizedName) {
      return res.status(400).json({ message: "Name is required" });
    }

    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      return res.status(400).json({ message: "A valid email is required" });
    }

    const existingUser = await User.findOne({
      email: normalizedEmail,
      _id: { $ne: userId },
    });

    if (existingUser) {
      return res.status(400).json({ message: "Email is already in use" });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { name: normalizedName, email: normalizedEmail },
      { new: true, runValidators: true },
    ).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const stats = await getProfileStats(user._id.toString());

    return res.json({
      message: "Profile updated successfully",
      user,
      stats,
    });
  } catch (error: any) {
    console.log(error);
    return res.status(500).json({ message: error.message });
  }
};
