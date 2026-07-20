import mongoose, { Document, Schema } from 'mongoose';

export interface IMemory extends Document {
  familyId: mongoose.Types.ObjectId;
  authorId: mongoose.Types.ObjectId;
  title: string;
  description: string;
  date: Date;
  photoIds?: mongoose.Types.ObjectId[];
  tags?: string[];
}

const MemorySchema: Schema = new Schema({
  familyId: { type: Schema.Types.ObjectId, ref: 'Family', required: true, index: true },
  authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  date: { type: Date, required: true, index: true },
  photoIds: [{ type: Schema.Types.ObjectId, ref: 'Photo' }],
  tags: [{ type: String }]
}, {
  timestamps: true
});

export default mongoose.model<IMemory>('Memory', MemorySchema);
