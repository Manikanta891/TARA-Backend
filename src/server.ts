import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import authRoutes from './routes/auth.routes';
import photoRoutes from './routes/photo.routes';
import driveRoutes from './routes/drive.routes';
import familyRoutes from './routes/family.routes';
import memoryRoutes from './routes/memory.routes';
import Photo from './models/Photo';
import Family from './models/Family';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Trust reverse proxy (e.g. Render, Vercel, Cloudflare) for accurate IP rate-limiting
app.set('trust proxy', 1);

// Security headers
app.use(helmet());

// CORS — fail in production if CLIENT_URL not set
const clientUrl = process.env.CLIENT_URL;
if (process.env.NODE_ENV === 'production' && !clientUrl) {
  console.error('FATAL: CLIENT_URL environment variable must be set in production');
  process.exit(1);
}
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (clientUrl && origin === clientUrl) return callback(null, true);
    if (process.env.NODE_ENV !== 'production') {
      // Allow localhost and any local Wi-Fi network IP (192.168.x.x, 10.x.x.x, 172.x.x.x)
      if (/^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }
    }
    callback(null, true);
  },
  credentials: true
}));

// Body parsing with size limit
app.use(express.json({ limit: '500kb' }));
app.use(cookieParser());

// Global rate limiter
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests, please try again later' },
});
app.use(globalLimiter);

// Stricter rate limiter for auth and join endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many attempts, please try again later' },
});

const joinLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many join attempts, please try again later' },
});

// Routes with rate limiting
app.use('/api/auth', authRoutes);
app.use('/api/photos', photoRoutes);
app.use('/api/drive', driveRoutes);
app.use('/api/family/join', joinLimiter);
app.use('/api/family', familyRoutes);
app.use('/api/memories', memoryRoutes);

// Cleanup soft-deleted photos older than 30 days
const cleanupDeletedPhotos = async () => {
  try {
    const threshold = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const expiredPhotos = await Photo.find({ isDeleted: true, deletedAt: { $lt: threshold } });
    
    for (const photo of expiredPhotos) {
      try {
        const family = await Family.findById(photo.familyId);
        if (family?.driveRefreshToken) {
          const { setDriveCredentials, deleteFile } = await import('./services/drive.service');
          const drive = setDriveCredentials(family.driveRefreshToken);
          await deleteFile(drive, photo.driveFileId);
        }
      } catch {
        // Continue deleting from DB even if Drive deletion fails
      }
      await Photo.findByIdAndDelete(photo._id);
    }
  } catch {
    // Silent cleanup failure
  }
};

// Database connection
const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      console.warn('MongoDB URI is not defined. Skipping DB connection.');
      return;
    }
    await mongoose.connect(mongoUri);
    console.log('MongoDB connected successfully');
    
    setInterval(cleanupDeletedPhotos, 24 * 60 * 60 * 1000);
    cleanupDeletedPhotos();
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

// Health check
app.get('/api/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Global error handler — prevents stack trace leaks
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error:', err.message, err.stack);
  res.status(500).json({ message: 'Internal server error' });
});

app.listen(PORT, async () => {
  await connectDB();
  console.log(`Server running on port ${PORT}`);
});
