import { Request, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import User from '../models/User';
import { AuthRequest } from '../middlewares/auth.middleware';

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const hashToken = (token: string): string => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

const generateTokens = (userId: string) => {
  const accessToken = jwt.sign({ id: userId }, process.env.JWT_SECRET as string, { expiresIn: '30d' });
  const refreshToken = jwt.sign({ id: userId }, process.env.JWT_REFRESH_SECRET as string, { expiresIn: '90d' });
  return { accessToken, refreshToken };
};

const isProduction = process.env.NODE_ENV === 'production';

const setTokenCookies = (res: Response, accessToken: string, refreshToken: string) => {
  res.cookie('accessToken', accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    path: '/',
  });

  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: 90 * 24 * 60 * 60 * 1000, // 90 days
    path: '/',
  });
};

export const googleLogin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { credential } = req.body;
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload) {
      res.status(400).json({ message: 'Invalid Google Token' });
      return;
    }

    const { sub, email, name, picture } = payload;

    let user = await User.findOne({ googleId: sub });
    if (!user) {
      user = await User.create({
        googleId: sub,
        email,
        name,
        avatarUrl: picture,
        families: [],
      });
    }

    const { accessToken, refreshToken } = generateTokens(user._id.toString());

    user.currentRefreshToken = hashToken(refreshToken);
    await user.save();

    setTokenCookies(res, accessToken, refreshToken);

    res.status(200).json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        avatarUrl: user.avatarUrl,
        families: user.families,
      },
    });
  } catch (error) {
    console.error('Google login error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const logout = async (req: Request, res: Response): Promise<void> => {
  // Invalidate refresh token in database
  const refreshToken = req.cookies?.refreshToken;
  if (refreshToken) {
    try {
      const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET as string) as { id: string };
      const user = await User.findById(payload.id);
      if (user) {
        user.currentRefreshToken = undefined;
        await user.save();
      }
    } catch {
      // Token already invalid, continue with logout
    }
  }

  res.clearCookie('accessToken', { httpOnly: true, secure: isProduction, sameSite: 'lax', path: '/' });
  res.clearCookie('refreshToken', { httpOnly: true, secure: isProduction, sameSite: 'lax', path: '/' });
  res.status(200).json({ message: 'Logged out successfully' });
};

export const refreshToken = async (req: Request, res: Response): Promise<void> => {
  const token = req.cookies?.refreshToken;
  if (!token) {
    res.status(401).json({ message: 'Not authenticated' });
    return;
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET as string) as { id: string };
    const user = await User.findById(payload.id);
    if (!user || user.status === 'disabled') {
      res.status(401).json({ message: 'User not found or disabled' });
      return;
    }

    const tokens = generateTokens(user._id.toString());
    
    user.currentRefreshToken = hashToken(tokens.refreshToken);
    await user.save();

    setTokenCookies(res, tokens.accessToken, tokens.refreshToken);

    res.status(200).json({ message: 'Token refreshed' });
  } catch {
    res.status(401).json({ message: 'Invalid or expired refresh token' });
  }
};

export const getMe = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = req.user;
    if (!user) {
      res.status(401).json({ message: 'Not authenticated' });
      return;
    }
    
    const populatedUser = await User.findById(user._id)
      .select('name email avatarUrl families')
      .populate('families.familyId', 'babyName driveFolderId');

    res.status(200).json({
      user: {
        id: populatedUser?._id,
        name: populatedUser?.name,
        email: populatedUser?.email,
        avatarUrl: populatedUser?.avatarUrl,
        families: populatedUser?.families,
      }
    });
  } catch {
    res.status(500).json({ message: 'Server error' });
  }
};
