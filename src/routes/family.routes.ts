import { Router } from 'express';
import { getFamilyMembers, inviteMember, getDashboardStats, createFamily, joinFamily, approveMember, promoteToParent, updateProfile, uploadAvatar, getAvatar, removeMember, updateBabyDetails, deleteFamily, uploadBabyAvatar, deleteBabyAvatar } from '../controllers/family.controller';
import { upload } from '../controllers/photo.controller';
import { protect, parentOnly } from '../middlewares/auth.middleware';
import { validate, createFamilySchema, joinFamilySchema, updateProfileSchema } from '../middlewares/validation';

const router = Router();

router.get('/members', protect, getFamilyMembers);
router.post('/invite', protect, inviteMember);
router.get('/dashboard', protect, getDashboardStats);
router.post('/create', protect, validate(createFamilySchema), createFamily);
router.post('/join', protect, validate(joinFamilySchema), joinFamily);

router.put('/baby', protect, parentOnly, updateBabyDetails);
router.post('/baby/avatar', protect, parentOnly, upload.single('avatar'), uploadBabyAvatar);
router.delete('/baby/avatar', protect, parentOnly, deleteBabyAvatar);
router.put('/profile', protect, updateProfile);

router.post('/members/:userId/approve', protect, parentOnly, approveMember);
router.post('/members/:userId/promote', protect, promoteToParent);
router.delete('/members/:userId', protect, removeMember);

router.put('/members/me', protect, validate(updateProfileSchema), updateProfile);
router.post('/members/me/avatar', protect, upload.single('avatar'), uploadAvatar);
router.get('/members/:userId/avatar', protect, getAvatar);

router.delete('/', protect, deleteFamily);

export default router;
