import { Request, Response } from "express";
import ContactMessage from "../models/ContactMessage.js";

export const submitContactMessage = async (req: Request, res: Response) => {
  try {
    const {
      name,
      email,
      subject,
      message,
      source,
    } = req.body as {
      name?: string;
      email?: string;
      subject?: string;
      message?: string;
      source?: string;
    };

    const normalizedName = name?.trim();
    const normalizedEmail = email?.trim().toLowerCase();
    const normalizedSubject = subject?.trim();
    const normalizedMessage = message?.trim();

    if (!normalizedName) {
      return res.status(400).json({ message: "Name is required" });
    }

    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      return res.status(400).json({ message: "A valid email is required" });
    }

    if (!normalizedMessage || normalizedMessage.length < 10) {
      return res
        .status(400)
        .json({ message: "Message should be at least 10 characters long" });
    }

    await ContactMessage.create({
      name: normalizedName,
      email: normalizedEmail,
      subject: normalizedSubject,
      message: normalizedMessage,
      source: source?.trim() || "website",
    });

    return res.status(201).json({
      message:
        "Thanks for reaching out. We have received your message and will get back to you soon.",
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Unable to submit contact form";

    console.error("Contact submission error:", error);
    return res.status(500).json({ message });
  }
};
