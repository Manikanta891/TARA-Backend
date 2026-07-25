import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth.middleware';
import mongoose from 'mongoose';
import Memory from '../models/Memory';

export const createMemory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const familyId = req.currentFamilyId;
    if (!familyId || !mongoose.Types.ObjectId.isValid(familyId)) {
      res.status(400).json({ message: 'No valid family context provided.' });
      return;
    }

    const { title, description, date, tags } = req.body;

    const memory = await Memory.create({
      familyId,
      authorId: req.user._id,
      title,
      description: description || '',
      date: date ? new Date(date) : new Date(),
      tags: tags || [],
    });

    res.status(201).json({ message: 'Memory created successfully', memory });
  } catch (error) {
    console.error('Error creating memory:', error);
    res.status(500).json({ message: 'Failed to create memory' });
  }
};

export const getMemories = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const familyId = req.currentFamilyId;
    if (!familyId || !mongoose.Types.ObjectId.isValid(familyId)) {
      res.status(400).json({ message: 'No valid family context provided.' });
      return;
    }

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip = (page - 1) * limit;

    if (req.membership?.status !== 'active') {
      res.status(403).json({ message: 'Membership is not active' });
      return;
    }

    const [memories, total] = await Promise.all([
      Memory.find({ familyId })
        .sort({ date: -1 })
        .skip(skip)
        .limit(limit)
        .populate('authorId', 'name avatarUrl'),
      Memory.countDocuments({ familyId }),
    ]);

    res.status(200).json({
      memories,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching memories:', error);
    res.status(500).json({ message: 'Failed to fetch memories' });
  }
};

export const deleteMemory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const familyId = req.currentFamilyId;
    const { id } = req.params;

    const memory = await Memory.findOne({ _id: id, familyId });
    if (!memory) {
      res.status(404).json({ message: 'Memory not found' });
      return;
    }

    if (req.membership?.role !== 'parent' && memory.authorId.toString() !== req.user._id.toString()) {
      res.status(403).json({ message: 'Not authorized to delete this memory' });
      return;
    }

    await Memory.findByIdAndDelete(id);
    res.status(200).json({ message: 'Memory deleted successfully' });
  } catch (error) {
    console.error('Error deleting memory:', error);
    res.status(500).json({ message: 'Failed to delete memory' });
  }
};
