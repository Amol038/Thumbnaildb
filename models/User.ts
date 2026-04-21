import mongoose, { Document } from 'mongoose';
import {
  EMAIL_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  USER_NAME_MAX_LENGTH,
  USER_NAME_MIN_LENGTH,
  emailPattern,
} from "../utils/validation.js";

export interface IUser extends Document {
  name: string;
  email: string;
  password?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const UserSchema = new mongoose.Schema<IUser>({
  name: {
    type: String,
    required: true,
    trim: true,
    minlength: USER_NAME_MIN_LENGTH,
    maxlength: USER_NAME_MAX_LENGTH,
  },
  email: { type: String, required: true, trim: true ,unique: true,
    lowercase: true, maxlength: EMAIL_MAX_LENGTH, match: emailPattern},
  password:{
    type:String,
    required:true,
    minlength: PASSWORD_MIN_LENGTH,
    maxlength: PASSWORD_MAX_LENGTH,
  }
},{timestamps:true})

const User = mongoose.models.User || mongoose.model<IUser>('User',UserSchema)

export default User
