import mongoose, { Document } from "mongoose";

export interface IContactMessage extends Document {
  name: string;
  email: string;
  subject?: string;
  message: string;
  source?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const ContactMessageSchema = new mongoose.Schema<IContactMessage>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    subject: { type: String, trim: true },
    message: { type: String, required: true, trim: true },
    source: { type: String, trim: true, default: "website" },
  },
  { timestamps: true },
);

const ContactMessage =
  mongoose.models.ContactMessage ||
  mongoose.model<IContactMessage>("ContactMessage", ContactMessageSchema);

export default ContactMessage;
