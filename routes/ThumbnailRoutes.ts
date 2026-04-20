import express from 'express';
import { deleteThumbnail, generateThumbnail } from '../controllers/ThumbnailController.js';
import protect from '../middlewares/auth.js';

const ThumbnailRouter = express.Router();

ThumbnailRouter.use(protect);
ThumbnailRouter.post('/generate', generateThumbnail);
ThumbnailRouter.delete('/delete/:id', deleteThumbnail);

export default ThumbnailRouter;
