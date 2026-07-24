import { Router } from 'express';
import { uploadPhoto, upload, getPhotos, getDeletedPhotos, restorePhoto, permanentDeletePhoto, streamThumbnail, streamOriginal, deletePhoto, updatePhotoDetails } from '../controllers/photo.controller';
import { protect } from '../middlewares/auth.middleware';

const router = Router();

router.post('/upload', protect, upload.single('photo'), uploadPhoto);
router.get('/', protect, getPhotos);
router.get('/deleted', protect, getDeletedPhotos);
router.get('/:id/thumbnail', protect, streamThumbnail);
router.get('/:id/original', protect, streamOriginal);
router.put('/:id', protect, updatePhotoDetails);
router.delete('/:id', protect, deletePhoto);
router.post('/:id/restore', protect, restorePhoto);
router.delete('/:id/permanent', protect, permanentDeletePhoto);

export default router;
