import { Request, Response } from 'express'
import User from '../models/User.js';
import bcrypt from 'bcrypt'
import {
  hasValidationErrors,
  validateLoginPayload,
  validateRegisterPayload,
} from "../utils/validation.js";

// ✅ FIX: extend session type
import "express-session";

declare module "express-session" {
  interface SessionData {
    isLoggedIn?: boolean;
    userId?: string;
  }
}

// Controllers For User Registration
export const registerUser = async (req: Request, res: Response) => {
  try {
    const { errors, normalizedName, normalizedEmail, password } =
      validateRegisterPayload(req.body ?? {});

    if (hasValidationErrors(errors)) {
      return res.status(422).json({
        message: "Please correct the highlighted fields.",
        errors,
      });
    }

    // find user by email
    const user = await User.findOne({ email: normalizedEmail });
    if(user){
        return res.status(409).json({
            message: 'An account with this email already exists',
            errors: { email: "This email is already registered." },
        })
    }

    // Encrypt the password
    const salt = await bcrypt.genSalt(10)
    const hashedPassword = await bcrypt.hash(password, salt)

    const newUser = new User({
        name: normalizedName,
        email: normalizedEmail,
        password: hashedPassword,
    })
    await newUser.save()

    // setting user data in session
    req.session.isLoggedIn = true;
    req.session.userId = newUser._id.toString(); // ✅ FIX

    return res.json({
        message: 'Account created successfully',
        user: {
            _id: newUser._id,
            name: newUser.name,
            email: newUser.email
        }
    })

  } catch (error: any) {
    console.log(error);
    res.status(500).json({message: error.message })
  }
}

// Controller for User Login
export const loginUser = async (req: Request, res: Response) => {
  try {
    const { errors, normalizedEmail, password } = validateLoginPayload(
      req.body ?? {},
    );

    if (hasValidationErrors(errors)) {
      return res.status(422).json({
        message: "Please correct the highlighted fields.",
        errors,
      });
    }

    // find user by email
    const user = await User.findOne({ email: normalizedEmail });
    if(!user){
        return res.status(401).json({message: 'Invalid email or password'})
    }

    const isPasswordCorrect = await bcrypt.compare(password,user.password)
    if(!isPasswordCorrect){
        return res.status(401).json({message: 'Invalid email or password'})
    }

    // setting user data in session
    req.session.isLoggedIn = true;
    req.session.userId = user._id.toString(); // ✅ FIX

    return res.json({
        message: 'Login successfully',
        user: {
            _id: user._id,
            name: user.name,
            email: user.email
        }
    })
        
  } catch (error:any) {
    console.log(error);
    res.status(500).json({message: error.message })
  }
}

// Controllers for user logout
export const logoutUser = async (req: Request, res: Response) => {
  req.session.destroy((error:any)=>{
    if(error){
        console.log(error)
        return res.status(500).json({message:error.message})
    }
  })
  return res.json({message:'Logout successful'})
}

// Controllers for user verify
export const verifyUser = async (req: Request, res: Response) => {
  try {
    const { userId } = req.session;

    const user = await User.findById(userId).select('-password')
    if(!user){
        return res.status(400).json({ message: 'Invalid user' });
    }

    return res.json({ user });
        
  } catch (error:any) {
    console.log(error);
    res.status(500).json({message: error.message })    
  }
}
