import mongoose, { Document, Schema } from 'mongoose';

export interface IUser extends Document {
  googleId: string;
  email: string;
  name: string;
  avatarUrl?: string;
  status?: 'active' | 'disabled';
  families: {
    familyId: mongoose.Types.ObjectId;
    role: 'parent' | 'member';
    status: 'active' | 'pending' | 'disabled';
    relationshipToBaby?: string;
    nickname?: string;
    avatarFileId?: string;
    avatarBase64?: string;
    joinedAt: Date;
  }[];
  currentRefreshToken?: string;
}

const UserSchema: Schema = new Schema({
  googleId: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  avatarUrl: { type: String },
  status: { type: String, enum: ['active', 'disabled'], default: 'active' },
  families: [{
    familyId: { type: Schema.Types.ObjectId, ref: 'Family' },
    role: { type: String, enum: ['parent', 'member'] },
    status: { type: String, enum: ['active', 'pending', 'disabled'], default: 'active' },
    relationshipToBaby: { type: String },
    nickname: { type: String },
    avatarFileId: { type: String },
    avatarBase64: { type: String },
    joinedAt: { type: Date, default: Date.now }
  }],
  currentRefreshToken: { type: String }
}, {
  timestamps: true
});

export default mongoose.model<IUser>('User', UserSchema);
