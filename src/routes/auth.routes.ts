import { Router } from 'express';
import { googleLogin, logout, refreshToken, getMe } from '../controllers/auth.controller';
import { protect } from '../middlewares/auth.middleware';

const router = Router();

router.post('/google', googleLogin);
router.post('/logout', logout);
router.post('/refresh', refreshToken);
router.get('/me', protect, getMe);

export default router;
