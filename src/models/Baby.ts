import mongoose, { Document, Schema } from 'mongoose';

export interface IBaby extends Document {
  familyId: mongoose.Types.ObjectId;
  name: string;
  birthDate: Date;
  profilePhotoUrl?: string;
  nickname?: string;
  description?: string;
}

const BabySchema: Schema = new Schema({
  familyId: { type: Schema.Types.ObjectId, ref: 'Family', required: true },
  name: { type: String, required: true },
  birthDate: { type: Date, required: true },
  profilePhotoUrl: { type: String },
  nickname: { type: String },
  description: { type: String }
}, {
  timestamps: true
});

export default mongoose.model<IBaby>('Baby', BabySchema);
