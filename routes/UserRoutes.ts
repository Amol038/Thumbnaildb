import express from 'express';
import {
  getThumbnailbyId,
  getUserProfile,
  getUsersThumbnails,
  updateUserProfile,
} from '../controllers/UserController.js';
import protect from '../middlewares/auth.js';

const UserRouter = express.Router();

UserRouter.use(protect);
UserRouter.get('/profile', getUserProfile);
UserRouter.patch('/profile', updateUserProfile);
UserRouter.get('/thumbnails', getUsersThumbnails);
UserRouter.get('/thumbnail/:id', getThumbnailbyId);

export default UserRouter;
