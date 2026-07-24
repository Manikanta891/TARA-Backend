import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import multer from 'multer';
import sharp from 'sharp';
import { Readable } from 'stream';
import mongoose from 'mongoose';
import Photo from '../models/Photo';
import Family from '../models/Family';
import crypto from 'crypto';
import { setDriveCredentials, uploadFileStream, getFileStream, getOrCreateFolder } from '../services/drive.service';

const storage = multer.memoryStorage();
export const upload = multer({ 
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only images are allowed'));
    }
  }
});

export const uploadPhoto = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    const familyId = req.currentFamilyId;
    if (!familyId) {
      res.status(400).json({ message: 'No family context provided' });
      return;
    }

    const family = await Family.findById(familyId);
    if (!family || !family.driveFolderId || !family.driveRefreshToken) {
      res.status(400).json({ message: 'Family Google Drive is not connected' });
      return;
    }

    // Enforce family upload settings
    if (!family.settings?.allowMemberUploads && req.membership?.role !== 'parent') {
      res.status(403).json({ message: 'Only parents are allowed to upload photos' });
      return;
    }

    if (!req.file) {
      res.status(400).json({ message: 'No file uploaded' });
      return;
    }

    // Process image with sharp (correct orientation and generate thumbnail)
    const imageBuffer = req.file.buffer;
    
    const originalBuffer = await sharp(imageBuffer)
      .rotate()
      .jpeg({ quality: 85 })
      .toBuffer();
    
    const originalMetadata = await sharp(originalBuffer).metadata();

    const thumbnailBuffer = await sharp(imageBuffer)
      .rotate()
      .resize(400, 400, { fit: 'cover' })
      .jpeg({ quality: 80 })
      .toBuffer();

    const capturedDate = req.body.capturedDate ? new Date(req.body.capturedDate) : new Date();
    const day = String(capturedDate.getDate()).padStart(2, '0');
    const month = String(capturedDate.getMonth() + 1).padStart(2, '0');
    const year = capturedDate.getFullYear();
    const dateStr = `${day}-${month}-${year}`;

    const drive = setDriveCredentials(family.driveRefreshToken);

    const yearFolderId = await getOrCreateFolder(drive, year.toString(), family.driveFolderId);
    const monthFolderId = await getOrCreateFolder(drive, capturedDate.toLocaleString('default', { month: 'long' }), yearFolderId);

    const safeCaption = req.body.caption ? req.body.caption.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30) : '';
    const uniqueSuffix = crypto.randomBytes(3).toString('hex');
    const cleanFileName = safeCaption ? `${dateStr}_${safeCaption}_${uniqueSuffix}.jpg` : `${dateStr}_${uniqueSuffix}.jpg`;

    const originalStream = Readable.from(originalBuffer);

    const originalUpload = await uploadFileStream(
      drive,
      originalStream,
      cleanFileName,
      'image/jpeg',
      monthFolderId
    );

    const thumbnailBase64 = thumbnailBuffer.toString('base64');

    let tags: string[] = [];
    if (req.body.tags) {
      try {
        const parsed = JSON.parse(req.body.tags);
        if (Array.isArray(parsed)) {
          tags = Array.from(new Set(parsed.map((t: any) => String(t).trim().toLowerCase()).filter(Boolean)));
        }
      } catch (e) {
        res.status(400).json({ message: 'Invalid tags format' });
        return;
      }
    }

    const photo = await Photo.create({
      familyId: family._id,
      uploaderId: user._id,
      driveFileId: originalUpload.id,
      thumbnailBase64: thumbnailBase64,
      originalFilename: cleanFileName,
      fileType: 'image/jpeg',
      fileSize: originalUpload.size || originalBuffer.length,
      width: originalMetadata.width,
      height: originalMetadata.height,
      capturedDate: capturedDate,
      caption: req.body.caption || '',
      tags
    });

    res.status(201).json({ message: 'Photo uploaded successfully', photo });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ message: 'Failed to upload photo' });
  }
};

export const getPhotos = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const familyId = req.currentFamilyId;
    if (!familyId) {
      res.status(400).json({ message: 'No family context provided' });
      return;
    }

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const skip = (page - 1) * limit;

    const [photos, total] = await Promise.all([
      Photo.find({ familyId, isDeleted: false })
        .sort({ capturedDate: -1 })
        .skip(skip)
        .limit(limit)
        .populate('uploaderId', 'name avatarUrl'),
      Photo.countDocuments({ familyId, isDeleted: false }),
    ]);

    res.status(200).json({
      photos,
      currentUserRole: req.membership?.role,
      currentUserId: req.user._id,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Fetch photos error:", error);
    res.status(500).json({ message: 'Failed to fetch photos' });
  }
};

export const getDeletedPhotos = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const familyId = req.currentFamilyId;
    if (!familyId) {
      res.status(400).json({ message: 'No family context provided' });
      return;
    }

    const photos = await Photo.find({ 
      familyId, 
      isDeleted: true
    })
      .sort({ deletedAt: -1, updatedAt: -1 })
      .populate('uploaderId', 'name avatarUrl');

    res.status(200).json(photos);
  } catch (error) {
    console.error("Fetch deleted photos error:", error);
    res.status(500).json({ message: 'Failed to fetch deleted photos' });
  }
};

export const restorePhoto = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.membership?.role !== 'parent') {
      res.status(403).json({ message: 'Only parents can restore photos' });
      return;
    }

    const { id } = req.params;
    const photo = await Photo.findOne({ _id: id, familyId: req.currentFamilyId, isDeleted: true });
    if (!photo) {
      res.status(404).json({ message: 'Deleted photo not found' });
      return;
    }

    photo.isDeleted = false;
    photo.deletedAt = undefined;
    await photo.save();

    res.status(200).json({ message: 'Photo restored successfully' });
  } catch (error) {
    console.error('Failed to restore photo:', error);
    res.status(500).json({ message: 'Failed to restore photo' });
  }
};

export const permanentDeletePhoto = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.membership?.role !== 'parent') {
      res.status(403).json({ message: 'Only parents can permanently delete photos' });
      return;
    }

    const { id } = req.params;
    const photo = await Photo.findOne({ _id: id, familyId: req.currentFamilyId, isDeleted: true });
    if (!photo) {
      res.status(404).json({ message: 'Deleted photo not found' });
      return;
    }

    // Delete from Google Drive
    try {
      const family = await Family.findById(req.currentFamilyId);
      if (family?.driveRefreshToken) {
        const { setDriveCredentials, deleteFile } = await import('../services/drive.service');
        const drive = setDriveCredentials(family.driveRefreshToken);
        await deleteFile(drive, photo.driveFileId);
      }
    } catch (driveError) {
      console.error('Failed to delete from Drive, continuing with DB deletion:', driveError);
    }

    await Photo.findByIdAndDelete(id);
    res.status(200).json({ message: 'Photo permanently deleted' });
  } catch (error) {
    console.error('Failed to permanently delete photo:', error);
    res.status(500).json({ message: 'Failed to permanently delete photo' });
  }
};

export const streamThumbnail = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const photoId = req.params.id as string;

    if (typeof photoId !== 'string' || !mongoose.Types.ObjectId.isValid(photoId)) {
      res.status(400).json({ message: 'Invalid photo ID' });
      return;
    }

    const photo = await Photo.findOne({ _id: photoId, familyId: req.currentFamilyId });
    if (!photo) {
      res.status(404).json({ message: 'Photo not found' });
      return;
    }

    if (photo.thumbnailBase64) {
      const buffer = Buffer.from(photo.thumbnailBase64, 'base64');
      const stream = Readable.from(buffer);
      res.setHeader('Content-Type', 'image/jpeg');
      stream.pipe(res);
      return;
    }

    if (!photo.driveThumbnailId) {
      res.status(404).json({ message: 'Thumbnail not available' });
      return;
    }

    const family = await Family.findById(req.currentFamilyId);
    if (!family || !family.driveRefreshToken) {
      res.status(400).json({ message: 'Google Drive is not connected' });
      return;
    }

    const drive = setDriveCredentials(family.driveRefreshToken);

    const stream = await getFileStream(drive, photo.driveThumbnailId);
    res.setHeader('Content-Type', photo.fileType || 'image/jpeg');
    stream.pipe(res);
  } catch (error) {
    res.status(500).json({ message: 'Failed to stream thumbnail' });
  }
};

export const streamOriginal = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const photoId = req.params.id as string;

    if (typeof photoId !== 'string' || !mongoose.Types.ObjectId.isValid(photoId)) {
      res.status(400).json({ message: 'Invalid photo ID' });
      return;
    }

    const photo = await Photo.findOne({ _id: photoId, familyId: req.currentFamilyId, isDeleted: false });
    if (!photo) {
      res.status(404).json({ message: 'Photo not found' });
      return;
    }

    const family = await Family.findById(req.currentFamilyId);
    if (!family || !family.driveRefreshToken) {
      res.status(400).json({ message: 'Google Drive is not connected' });
      return;
    }

    const drive = setDriveCredentials(family.driveRefreshToken);

    const stream = await getFileStream(drive, photo.driveFileId);
    res.setHeader('Content-Type', photo.fileType || 'image/jpeg');
    stream.pipe(res);
  } catch (error) {
    console.error('Failed to stream original photo:', error);
    res.status(500).json({ message: 'Failed to stream original photo' });
  }
};

export const deletePhoto = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    const photoId = req.params.id as string;

    if (typeof photoId !== 'string' || !mongoose.Types.ObjectId.isValid(photoId)) {
      res.status(400).json({ message: 'Invalid photo ID' });
      return;
    }

    const photo = await Photo.findOne({ _id: photoId, familyId: req.currentFamilyId });
    if (!photo) {
      res.status(404).json({ message: 'Photo not found' });
      return;
    }

    const uploaderIdStr = photo.uploaderId ? photo.uploaderId.toString() : '';
    const userIdStr = user?._id ? user._id.toString() : '';

    if (req.membership?.role !== 'parent' && uploaderIdStr !== userIdStr) {
      res.status(403).json({ message: 'Not authorized to delete this photo' });
      return;
    }

    photo.isDeleted = true;
    photo.deletedAt = new Date();
    await photo.save();

    res.status(200).json({ message: 'Photo deleted successfully' });
  } catch (error) {
    console.error('Failed to delete photo:', error);
    res.status(500).json({ message: 'Failed to delete photo' });
  }
};

export const updatePhotoDetails = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    const photoId = req.params.id as string;
    const { caption, capturedDate, tags } = req.body;

    if (typeof photoId !== 'string' || !mongoose.Types.ObjectId.isValid(photoId)) {
      res.status(400).json({ message: 'Invalid photo ID' });
      return;
    }

    const photo = await Photo.findOne({ _id: photoId, familyId: req.currentFamilyId, isDeleted: false });
    if (!photo) {
      res.status(404).json({ message: 'Photo not found' });
      return;
    }

    const uploaderIdStr = photo.uploaderId ? photo.uploaderId.toString() : '';
    const userIdStr = user?._id ? user._id.toString() : '';

    if (req.membership?.role !== 'parent' && uploaderIdStr !== userIdStr) {
      res.status(403).json({ message: 'Not authorized to edit this photo' });
      return;
    }

    if (caption !== undefined) photo.caption = caption;
    if (capturedDate) photo.capturedDate = new Date(capturedDate);
    if (tags !== undefined) {
      photo.tags = Array.isArray(tags) 
        ? Array.from(new Set(tags.map((t: any) => String(t).trim().toLowerCase()).filter(Boolean)))
        : [];
    }

    await photo.save();

    res.status(200).json({ message: 'Photo updated successfully', photo });
  } catch (error) {
    console.error('Failed to update photo:', error);
    res.status(500).json({ message: 'Failed to update photo' });
  }
};
