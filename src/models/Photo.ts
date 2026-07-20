import mongoose, { Document, Schema } from 'mongoose';

export interface IPhoto extends Document {
  familyId: mongoose.Types.ObjectId;
  uploaderId: mongoose.Types.ObjectId;
  driveFileId: string;
  driveThumbnailId?: string;
  thumbnailBase64?: string;
  originalFilename: string;
  fileType: string;
  fileSize: number;
  width?: number;
  height?: number;
  capturedDate?: Date;
  caption?: string;
  tags?: string[];
  albumId?: mongoose.Types.ObjectId;
  isDeleted: boolean;
  deletedAt?: Date;
}

const PhotoSchema: Schema = new Schema({
  familyId: { type: Schema.Types.ObjectId, ref: 'Family', required: true, index: true },
  uploaderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  driveFileId: { type: String, required: true },
  driveThumbnailId: { type: String },
  thumbnailBase64: { type: String },
  originalFilename: { type: String, required: true },
  fileType: { type: String, required: true },
  fileSize: { type: Number, required: true },
  width: { type: Number },
  height: { type: Number },
  capturedDate: { type: Date, index: true },
  caption: { type: String },
  tags: [{ type: String }],
  albumId: { type: Schema.Types.ObjectId, ref: 'Album' },
  isDeleted: { type: Boolean, default: false, index: true },
  deletedAt: { type: Date }
}, {
  timestamps: true
});

export default mongoose.model<IPhoto>('Photo', PhotoSchema);
