import { Router } from 'express';
import { getAuthUrl, handleCallback, getDriveStatus } from '../controllers/drive.controller';
import { protect, parentOnly } from '../middlewares/auth.middleware';

const router = Router();

router.get('/auth-url', protect, parentOnly, getAuthUrl);
router.get('/callback', handleCallback);
router.get('/status', protect, getDriveStatus);

export default router;
