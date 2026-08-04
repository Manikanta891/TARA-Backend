import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../middlewares/auth.middleware';
import { google } from 'googleapis';
import jwt from 'jsonwebtoken';
import Family from '../models/Family';
import { setDriveCredentials, createFolder, getOAuth2Client } from '../services/drive.service';

export const getAuthUrl = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.membership?.role !== 'parent') {
      res.status(403).json({ message: 'Only parents can connect Google Drive' });
      return;
    }

    const oAuth2Client = getOAuth2Client();
    const csrfToken = jwt.sign(
      { familyId: req.currentFamilyId, uid: req.user._id.toString() },
      process.env.JWT_SECRET as string,
      { expiresIn: '10m' }
    );
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['https://www.googleapis.com/auth/drive.file'],
      prompt: 'consent',
      state: csrfToken
    });

    res.status(200).json({ url: authUrl });
  } catch (error) {
    res.status(500).json({ message: 'Failed to generate auth url' });
  }
};

export const handleCallback = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { code, state } = req.query;
    if (!code || typeof code !== 'string') {
      res.status(400).json({ message: 'Missing auth code' });
      return;
    }
    if (!state || typeof state !== 'string') {
      res.status(400).json({ message: 'Missing or invalid state parameter' });
      return;
    }

    let familyId: string;
    let uid: string;
    try {
      const decoded = jwt.verify(state, process.env.JWT_SECRET as string) as { familyId: string; uid: string };
      familyId = decoded.familyId;
      uid = decoded.uid;
    } catch {
      res.status(403).json({ message: 'Invalid or expired CSRF token' });
      return;
    }

    const oAuth2Client = getOAuth2Client();
    const { tokens } = await oAuth2Client.getToken(code);
    
    if (tokens.refresh_token) {
      const family = await Family.findById(familyId);
      if (!family) {
        res.status(404).json({ message: 'Family not found' });
        return;
      }

      // Verify the requesting user is still a parent in this family
      const User = (await import('../models/User')).default;
      const user = await User.findById(uid);
      if (!user) {
        res.status(404).json({ message: 'User not found' });
        return;
      }
      const membership = user.families.find(f => f.familyId.toString() === familyId);
      if (!membership || membership.role !== 'parent' || membership.status !== 'active') {
        res.status(403).json({ message: 'Only active parents can connect Google Drive' });
        return;
      }

      const folderName = `${family.babyName || 'Baby'}-memories`;

      const drive = setDriveCredentials(tokens.refresh_token);
      const folderId = await createFolder(drive, folderName);
      
      family.driveRefreshToken = tokens.refresh_token;
      family.driveFolderId = folderId;
      family.driveConnectedByUserId = new mongoose.Types.ObjectId(uid);
      await family.save();
      
      console.log(`Successfully connected Google Drive for family ${familyId}. Folder created: ${folderId}`);
    }

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
    res.redirect(`${clientUrl}/family`);
  } catch (error) {
    console.error('Failed to authenticate with Google Drive:', error);
    res.status(500).json({ message: 'Failed to authenticate with Google Drive' });
  }
};
