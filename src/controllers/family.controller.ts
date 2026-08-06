import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import mongoose from 'mongoose';
import Family from '../models/Family';
import User from '../models/User';
import Photo from '../models/Photo';
import Memory from '../models/Memory';
import crypto from 'crypto';
import { Readable } from 'stream';
import sharp from 'sharp';
import { setDriveCredentials, uploadFileStream, getFileStream, deleteFile } from '../services/drive.service';

const FAMILY_FIELDS = 'babyName babyDob babyAvatarBase64 settings inviteCode driveFolderId driveConnectedByUserId createdAt';

const USER_FIELDS = 'name email avatarUrl families';

const mapMember = (m: any, familyId: string) => {
  const membership = m.families.find((f: any) => f.familyId.toString() === familyId);
  return {
    _id: m._id,
    name: m.name,
    email: m.email,
    avatarUrl: membership?.avatarBase64
      ? `data:image/jpeg;base64,${membership.avatarBase64}`
      : (membership?.avatarFileId ? `/api/family/members/${m._id}/avatar?familyId=${familyId}&t=${Date.now()}` : m.avatarUrl),
    role: membership?.role,
    status: membership?.status,
    relationshipToBaby: membership?.relationshipToBaby,
    nickname: membership?.nickname,
    joinedAt: membership?.joinedAt
  };
};

export const getFamilyMembers = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const familyId = req.currentFamilyId;
    if (!familyId) {
      res.status(400).json({ message: 'No family context provided (missing X-Family-Id header).' });
      return;
    }

    if (req.membership?.status !== 'active') {
      res.status(403).json({ message: 'Your membership is not active yet' });
      return;
    }

    const membersRaw = await User.find({ 'families.familyId': familyId });

    const activeMembers = membersRaw.filter(m => {
      const ms = m.families.find((f: any) => f.familyId.toString() === familyId);
      return ms && ms.status === 'active';
    }).map(m => mapMember(m, familyId));

    const pendingRequests = membersRaw.filter(m => {
      const ms = m.families.find((f: any) => f.familyId.toString() === familyId);
      return ms && ms.status === 'pending';
    }).map(m => mapMember(m, familyId));
    
    const family = await Family.findById(familyId).select(FAMILY_FIELDS);
    const familyObj = family ? family.toObject() : null;
    if (familyObj && familyObj.babyAvatarBase64) {
      (familyObj as any).babyAvatarUrl = `data:image/jpeg;base64,${familyObj.babyAvatarBase64}`;
    }

    res.status(200).json({ 
      members: activeMembers, 
      pendingRequests, 
      family: familyObj, 
      currentUserRole: req.membership?.role 
    });
  } catch (error) {
    console.error('Error fetching family members:', error);
    res.status(500).json({ message: 'Failed to fetch family members' });
  }
};

export const inviteMember = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.membership?.role !== 'parent') {
      res.status(403).json({ message: 'Only parents can invite members' });
      return;
    }

    if (!req.currentFamilyId) {
      res.status(400).json({ message: 'No family context provided' });
      return;
    }

    const { email } = req.body;
    if (!email || typeof email !== 'string') {
      res.status(400).json({ message: 'Email is required' });
      return;
    }

    const existingUser = await User.findOne({ 
      email: email.toLowerCase(), 
      'families.familyId': req.currentFamilyId 
    });
    
    if (existingUser) {
      res.status(400).json({ message: 'This person is already in your family' });
      return;
    }

    const family = await Family.findById(req.currentFamilyId);
    if (!family) {
      res.status(404).json({ message: 'Family not found' });
      return;
    }

    res.status(200).json({ 
      message: `Share this invite code with ${email}`,
      inviteCode: family.inviteCode,
    });
  } catch (error) {
    console.error('Error inviting member:', error);
    res.status(500).json({ message: 'Failed to invite member' });
  }
};

export const getDashboardStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const familyId = req.currentFamilyId;
    if (!familyId || !mongoose.Types.ObjectId.isValid(familyId)) {
      res.status(400).json({ message: 'No valid family context provided' });
      return;
    }

    if (req.membership?.status !== 'active') {
      res.status(403).json({ message: 'Your membership is not active yet' });
      return;
    }

    const family = await Family.findById(familyId);
    if (!family) {
      res.status(404).json({ message: 'Family not found' });
      return;
    }

    const photosCount = await Photo.countDocuments({ familyId: family._id, isDeleted: false });
    const memoriesCount = await Memory.countDocuments({ familyId: family._id });

    const leaderboardRaw = await Photo.aggregate([
      { $match: { familyId: family._id, isDeleted: false } },
      { $group: { _id: '$uploaderId', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    const populatedLeaderboard = await User.find({ _id: { $in: leaderboardRaw.map(l => l._id) } });
    
    const leaderboard = leaderboardRaw.map(entry => {
      const u = populatedLeaderboard.find(p => p._id.toString() === entry._id.toString());
      const membership = u?.families.find((f: any) => f.familyId.toString() === familyId);
      return {
        userId: entry._id,
        name: membership?.nickname || u?.name || 'Unknown',
        relationship: membership?.relationshipToBaby || 'Member',
        count: entry.count,
        avatarUrl: membership?.avatarBase64 
          ? `data:image/jpeg;base64,${membership.avatarBase64}` 
          : (membership?.avatarFileId ? `/api/family/members/${entry._id}/avatar?familyId=${familyId}&t=${Date.now()}` : u?.avatarUrl)
      };
    });

    res.status(200).json({
      babyName: family.babyName || 'Baby',
      babyDob: family.babyDob || new Date('2026-02-10'),
      babyAvatarUrl: family.babyAvatarBase64 ? `data:image/jpeg;base64,${family.babyAvatarBase64}` : null,
      userRole: req.membership?.role,
      userRelationship: req.membership?.relationshipToBaby || 'Family Member',
      userNickname: req.membership?.nickname,
      userStatus: req.membership?.status,
      photosCount,
      memoriesCount,
      leaderboard
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ message: 'Failed to fetch dashboard stats' });
  }
};

export const updateBabyDetails = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.membership?.role !== 'parent') {
      res.status(403).json({ message: 'Only parents can edit baby details' });
      return;
    }

    const { babyName, babyDob } = req.body;
    const family = await Family.findById(req.currentFamilyId).select(FAMILY_FIELDS);
    
    if (!family) {
      res.status(404).json({ message: 'Family not found' });
      return;
    }

    if (babyName) family.babyName = babyName;
    if (babyDob) family.babyDob = new Date(babyDob);
    
    await family.save();

    res.status(200).json({ message: 'Baby details updated successfully', family });
  } catch (error) {
    console.error('Error updating baby details:', error);
    res.status(500).json({ message: 'Failed to update baby details' });
  }
};

export const uploadBabyAvatar = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.membership?.role !== 'parent') {
      res.status(403).json({ message: 'Only parents can update the baby display picture' });
      return;
    }
    if (!req.file) {
      res.status(400).json({ message: 'No image provided' });
      return;
    }
    if (req.file.size > 15 * 1024 * 1024) {
      res.status(400).json({ message: 'Image must be under 15MB' });
      return;
    }

    const family = await Family.findById(req.currentFamilyId);
    if (!family) {
      res.status(404).json({ message: 'Family not found' });
      return;
    }

    const processedImageBuffer = await sharp(req.file.buffer)
      .resize(300, 300, { fit: 'cover' })
      .jpeg({ quality: 80 })
      .toBuffer();

    const base64Image = processedImageBuffer.toString('base64');
    family.babyAvatarBase64 = base64Image;
    await family.save();

    res.status(200).json({
      message: 'Baby display picture updated successfully',
      babyAvatarUrl: `data:image/jpeg;base64,${base64Image}`
    });
  } catch (error) {
    console.error('Error uploading baby avatar:', error);
    res.status(500).json({ message: 'Failed to upload baby display picture' });
  }
};

export const deleteBabyAvatar = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.membership?.role !== 'parent') {
      res.status(403).json({ message: 'Only parents can remove the baby display picture' });
      return;
    }

    const family = await Family.findById(req.currentFamilyId);
    if (!family) {
      res.status(404).json({ message: 'Family not found' });
      return;
    }

    family.babyAvatarBase64 = undefined;
    await family.save();

    res.status(200).json({ message: 'Baby display picture removed successfully' });
  } catch (error) {
    console.error('Error deleting baby avatar:', error);
    res.status(500).json({ message: 'Failed to remove baby display picture' });
  }
};

export const createFamily = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    const { babyName, babyDob, relationshipToBaby } = req.body;

    const newFamily = await Family.create({
      inviteCode: crypto.randomBytes(6).toString('hex').toUpperCase(),
      babyName: babyName || 'Baby',
      babyDob: babyDob ? new Date(babyDob) : new Date(),
    });

    user.families.push({
      familyId: newFamily._id,
      role: 'parent',
      relationshipToBaby: relationshipToBaby || 'Parent',
      status: 'active',
      joinedAt: new Date()
    });
    
    await user.save();

    res.status(201).json({
      message: 'Family created successfully',
      family: { _id: newFamily._id, babyName: newFamily.babyName, inviteCode: newFamily.inviteCode }
    });
  } catch (error) {
    console.error('Error creating family:', error);
    res.status(500).json({ message: 'Failed to create family' });
  }
};

export const getFamilyByCode = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { code } = req.params;
    if (!code || typeof code !== 'string') {
      res.status(400).json({ message: 'Invite code is required' });
      return;
    }

    const family = await Family.findOne({ inviteCode: code.trim().toUpperCase() }).select('babyName inviteCode createdAt');
    if (!family) {
      res.status(404).json({ message: 'Invalid invite code' });
      return;
    }

    const user = req.user;
    const existing = user?.families.find((f: any) => f.familyId.toString() === family._id.toString());

    res.status(200).json({
      familyId: family._id,
      babyName: family.babyName,
      inviteCode: family.inviteCode,
      alreadyMember: Boolean(existing),
      membershipStatus: existing?.status || null,
      membershipRole: existing?.role || null,
    });
  } catch (error) {
    console.error('Error fetching family by code:', error);
    res.status(500).json({ message: 'Failed to fetch family details' });
  }
};

export const joinFamily = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    const { inviteCode, relationshipToBaby } = req.body;
    
    const family = await Family.findOne({ inviteCode: inviteCode.toUpperCase() });

    if (!family) {
      res.status(404).json({ message: 'Invalid invite code' });
      return;
    }

    const existing = user.families.find((f: any) => f.familyId.toString() === family._id.toString());
    if (existing) {
      res.status(200).json({
        message: existing.status === 'active' 
          ? 'You are already an active member of this family album' 
          : 'Your request to join this family album is pending approval',
        familyId: family._id,
        alreadyMember: true,
        status: existing.status
      });
      return;
    }

    user.families.push({
      familyId: family._id,
      role: 'member',
      relationshipToBaby: relationshipToBaby || 'Family Member',
      status: 'pending',
      joinedAt: new Date()
    });
    
    await user.save();

    res.status(200).json({ message: 'Joined family successfully. Waiting for parent approval.', familyId: family._id, alreadyMember: false });
  } catch (error) {
    console.error('Error joining family:', error);
    res.status(500).json({ message: 'Failed to join family' });
  }
};

export const approveMember = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.membership?.role !== 'parent') {
      res.status(403).json({ message: 'Only parents can approve members' });
      return;
    }

    const { userId } = req.params;
    const member = await User.findById(userId);

    if (!member) {
      res.status(404).json({ message: 'Member not found' });
      return;
    }

    const mem = member.families.find((f: any) => f.familyId.toString() === req.currentFamilyId && f.status === 'pending');
    if (!mem) {
      res.status(404).json({ message: 'Pending membership not found' });
      return;
    }

    mem.status = 'active';
    await member.save();

    res.status(200).json({ message: 'Member approved successfully' });
  } catch (error) {
    console.error('Error approving member:', error);
    res.status(500).json({ message: 'Failed to approve member' });
  }
};

export const promoteToParent = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.membership?.role !== 'parent') {
      res.status(403).json({ message: 'Only parents can promote members' });
      return;
    }

    const { userId } = req.params;
    const member = await User.findById(userId);

    if (!member) {
      res.status(404).json({ message: 'Member not found' });
      return;
    }

    const mem = member.families.find((f: any) => f.familyId.toString() === req.currentFamilyId && f.status === 'active');
    if (!mem) {
      res.status(404).json({ message: 'Active membership not found' });
      return;
    }

    mem.role = 'parent';
    await member.save();

    res.status(200).json({ message: 'Member promoted to parent successfully' });
  } catch (error) {
    console.error('Error promoting member:', error);
    res.status(500).json({ message: 'Failed to promote member' });
  }
};

export const demoteMember = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.membership?.role !== 'parent') {
      res.status(403).json({ message: 'Only parents can demote members' });
      return;
    }

    const { userId } = req.params;
    if (req.user._id.toString() === userId) {
      res.status(400).json({ message: 'You cannot demote yourself directly. Promote another member or leave the family.' });
      return;
    }

    const member = await User.findById(userId);
    if (!member) {
      res.status(404).json({ message: 'Member not found' });
      return;
    }

    const mem = member.families.find((f: any) => f.familyId.toString() === req.currentFamilyId && f.status === 'active');
    if (!mem) {
      res.status(404).json({ message: 'Active membership not found' });
      return;
    }

    if (mem.role !== 'parent') {
      res.status(400).json({ message: 'Member is not a parent' });
      return;
    }

    const allMembers = await User.find({ 'families.familyId': req.currentFamilyId });
    const parentCount = allMembers.filter(m => {
      const fMem = m.families.find((f: any) => f.familyId.toString() === req.currentFamilyId);
      return fMem?.role === 'parent' && fMem?.status === 'active';
    }).length;

    if (parentCount <= 1) {
      res.status(400).json({ message: 'Cannot demote the last parent. At least one parent must remain.' });
      return;
    }

    mem.role = 'member';
    await member.save();

    res.status(200).json({ message: 'Parent role revoked successfully' });
  } catch (error) {
    console.error('Error demoting member:', error);
    res.status(500).json({ message: 'Failed to demote member' });
  }
};

export const leaveFamily = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    const familyId = req.currentFamilyId;

    if (!familyId) {
      res.status(400).json({ message: 'No family context provided' });
      return;
    }

    const membership = user.families.find((f: any) => f.familyId.toString() === familyId);
    if (!membership) {
      res.status(404).json({ message: 'You are not a member of this family' });
      return;
    }

    if (membership.role === 'parent' && membership.status === 'active') {
      const allMembers = await User.find({ 'families.familyId': familyId });
      const parentCount = allMembers.filter(m => {
        const mem = m.families.find((f: any) => f.familyId.toString() === familyId);
        return mem?.role === 'parent' && mem?.status === 'active';
      }).length;

      if (parentCount <= 1) {
        res.status(400).json({ message: 'Cannot leave as the only parent. Please promote another member to parent first, or delete the family album.' });
        return;
      }
    }

    user.families = user.families.filter((f: any) => f.familyId.toString() !== familyId);
    await user.save();

    const remainingFamilies = user.families.filter((f: any) => f.status === 'active');
    const nextFamilyId = remainingFamilies.length > 0 ? remainingFamilies[0].familyId : null;

    res.status(200).json({ 
      message: 'Left family album successfully', 
      nextFamilyId,
      hasOtherFamilies: remainingFamilies.length > 0
    });
  } catch (error) {
    console.error('Error leaving family:', error);
    res.status(500).json({ message: 'Failed to leave family' });
  }
};

export const removeMember = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.membership?.role !== 'parent') {
      res.status(403).json({ message: 'Only admins can remove members' });
      return;
    }

    const { userId } = req.params;
    
    if (req.user._id.toString() === userId) {
      res.status(400).json({ message: 'You cannot remove yourself' });
      return;
    }

    const member = await User.findById(userId);
    if (!member) {
      res.status(404).json({ message: 'Member not found' });
      return;
    }

    // Check that at least one parent remains after removal
    const membershipToRemove = member.families.find((f: any) => f.familyId.toString() === req.currentFamilyId);
    if (membershipToRemove?.role === 'parent') {
      const allMembers = await User.find({ 'families.familyId': req.currentFamilyId });
      const parentCount = allMembers.filter(m => {
        const mem = m.families.find((f: any) => f.familyId.toString() === req.currentFamilyId);
        return mem?.role === 'parent' && mem?.status === 'active';
      }).length;
      if (parentCount <= 1) {
        res.status(400).json({ message: 'Cannot remove the last parent. Promote another member first.' });
        return;
      }
    }

    member.families = member.families.filter((f: any) => f.familyId.toString() !== req.currentFamilyId);
    await member.save();

    res.status(200).json({ message: 'Member removed successfully' });
  } catch (error) {
    console.error('Error removing member:', error);
    res.status(500).json({ message: 'Failed to remove member' });
  }
};

export const updateProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    const { name, relationshipToBaby, nickname } = req.body;

    if (name) user.name = name;
    
    const mem = user.families.find((f: any) => f.familyId.toString() === req.currentFamilyId);
    if (mem) {
      if (relationshipToBaby) mem.relationshipToBaby = relationshipToBaby;
      if (nickname !== undefined) mem.nickname = nickname;
    }

    await user.save();

    res.status(200).json({
      message: 'Profile updated successfully',
      user: { name: user.name, email: user.email, avatarUrl: user.avatarUrl }
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ message: 'Failed to update profile' });
  }
};

export const uploadAvatar = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!req.file) {
      res.status(400).json({ message: 'No image provided' });
      return;
    }

    if (req.file.size > 15 * 1024 * 1024) {
      res.status(400).json({ message: 'Avatar must be under 15MB' });
      return;
    }

    const familyId = req.currentFamilyId;

    const processedImageBuffer = await sharp(req.file.buffer)
      .resize(300, 300, { fit: 'cover' })
      .jpeg({ quality: 80 })
      .toBuffer();

    const base64Image = processedImageBuffer.toString('base64');

    const mem = user.families.find((f: any) => f.familyId.toString() === familyId);
    if (mem) {
      mem.avatarBase64 = base64Image;
    }
    await user.save();

    res.status(200).json({ message: 'Avatar uploaded successfully', avatarUrl: `data:image/jpeg;base64,${base64Image}` });
  } catch (error) {
    console.error('Error uploading avatar:', error);
    res.status(500).json({ message: 'Failed to upload avatar' });
  }
};

export const getAvatar = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const familyId = req.query.familyId as string;
    
    const userToFetch = await User.findById(userId);
    if (!userToFetch) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    const mem = userToFetch.families.find((f: any) => f.familyId.toString() === familyId);
    
    if (mem?.avatarBase64) {
      const buffer = Buffer.from(mem.avatarBase64, 'base64');
      const stream = Readable.from(buffer);
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=31536000');
      stream.pipe(res);
      return;
    }

    if (!mem || !mem.avatarFileId) {
      // Only redirect to trusted HTTPS URLs
      if (userToFetch.avatarUrl && userToFetch.avatarUrl.startsWith('https://')) {
        res.redirect(userToFetch.avatarUrl);
        return;
      }
      res.status(404).json({ message: 'Avatar not found' });
      return;
    }

    const family = await Family.findById(familyId);
    if (!family || !family.driveRefreshToken) {
      res.status(400).json({ message: 'Family Drive not connected' });
      return;
    }

    const drive = setDriveCredentials(family.driveRefreshToken);
    const stream = await getFileStream(drive, mem.avatarFileId);

    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    stream.pipe(res);
  } catch (error) {
    console.error('Error fetching avatar:', error);
    res.status(500).json({ message: 'Failed to fetch avatar' });
  }
};

export const deleteFamily = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.membership?.role !== 'parent') {
      res.status(403).json({ message: 'Only parents can delete the family' });
      return;
    }

    const familyId = req.currentFamilyId;
    const family = await Family.findById(familyId);
    if (!family) {
      res.status(404).json({ message: 'Family not found' });
      return;
    }

    // 1. Delete Google Drive folder if connected
    if (family.driveRefreshToken && family.driveFolderId) {
      try {
        const drive = setDriveCredentials(family.driveRefreshToken);
        await deleteFile(drive, family.driveFolderId);
      } catch (driveError) {
        console.error('Failed to delete Drive folder, continuing with DB cleanup:', driveError);
      }
    }

    // 2. Delete all photos (DB records)
    await Photo.deleteMany({ familyId });

    // 3. Delete all memories
    await Memory.deleteMany({ familyId });

    // 4. Remove family from all members' families[] array
    await User.updateMany(
      { 'families.familyId': familyId },
      { $pull: { families: { familyId } } }
    );

    // 5. Delete the family document
    await Family.findByIdAndDelete(familyId);

    res.status(200).json({ message: 'Family deleted successfully' });
  } catch (error) {
    console.error('Error deleting family:', error);
    res.status(500).json({ message: 'Failed to delete family' });
  }
};
