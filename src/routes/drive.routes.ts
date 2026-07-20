import { Router } from 'express';
import { getAuthUrl, handleCallback } from '../controllers/drive.controller';
import { protect, parentOnly } from '../middlewares/auth.middleware';

const router = Router();

router.get('/auth-url', protect, parentOnly, getAuthUrl);
router.get('/callback', handleCallback);

export default router;
