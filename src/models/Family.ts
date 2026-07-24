import mongoose, { Document, Schema } from 'mongoose';

export interface IFamily extends Document {
  inviteCode: string;
  inviteCodeExpiry?: Date;
  babyName?: string;
  babyDob?: Date;
  babyAvatarBase64?: string;
  driveFolderId?: string;
  driveRefreshToken?: string;
  settings: {
    allowMemberUploads: boolean;
    requireParentApprovalForMilestones: boolean;
  };
}

const FamilySchema: Schema = new Schema({
  inviteCode: { type: String, required: true, unique: true },
  inviteCodeExpiry: { type: Date },
  babyName: { type: String, default: 'Tara' },
  babyDob: { type: Date, default: new Date('2026-02-10') },
  babyAvatarBase64: { type: String },
  driveFolderId: { type: String },
  driveRefreshToken: { type: String },
  settings: {
    allowMemberUploads: { type: Boolean, default: true },
    requireParentApprovalForMilestones: { type: Boolean, default: true }
  }
}, {
  timestamps: true
});

export default mongoose.model<IFamily>('Family', FamilySchema);
