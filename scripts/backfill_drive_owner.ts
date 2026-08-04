import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Family from '../src/models/Family';
import User from '../src/models/User';

dotenv.config();

async function backfill() {
  try {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      console.error('MONGO_URI is missing');
      process.exit(1);
    }
    
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    const targetFamilyId = '6a5f80b004b74d9022f113de'; // Thoshika praseedha
    const yassuUserId = '6a5f334504b74d9022f113bf';    // yassu (yasaswanisandula1419@gmail.com)

    const family = await Family.findById(targetFamilyId);
    if (!family) {
      console.error(`Family with ID ${targetFamilyId} not found.`);
      process.exit(1);
    }

    const user = await User.findById(yassuUserId);
    if (!user) {
      console.error(`User with ID ${yassuUserId} not found.`);
      process.exit(1);
    }

    (family as any).driveConnectedByUserId = new mongoose.Types.ObjectId(yassuUserId);
    await family.save();

    console.log(`✅ Successfully backfilled driveConnectedByUserId (${yassuUserId} / ${user.name}) for family "${family.babyName}" (${family._id})`);

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Backfill error:', error);
    process.exit(1);
  }
}

backfill();
