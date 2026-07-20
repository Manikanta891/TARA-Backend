import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User';

export interface AuthRequest extends Request {
  user?: any;
  currentFamilyId?: string;
  membership?: any;
}

export const protect = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token && req.cookies?.accessToken) {
    token = req.cookies.accessToken;
  }

  if (!token) {
    res.status(401).json({ message: 'Not authorized, no token' });
    return;
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as { id: string };
    const user = await User.findById(decoded.id).select('-currentRefreshToken');
    if (!user) {
      res.status(401).json({ message: 'User not found' });
      return;
    }
    if (user.status === 'disabled') {
      res.status(403).json({ message: 'Your account is disabled' });
      return;
    }
    
    req.user = user;
    const familyId = (req.headers['x-family-id'] as string) || (req.query.familyId as string);
    if (familyId && user.families) {
      const membership = user.families.find((f: any) => f.familyId.toString() === familyId);
      if (membership) {
        req.currentFamilyId = familyId;
        req.membership = membership;
      }
    }
    
    next();
  } catch {
    res.status(401).json({ message: 'Not authorized, token failed' });
    return;
  }
};

export const parentOnly = (req: AuthRequest, res: Response, next: NextFunction): void => {
  if (req.membership && req.membership.role === 'parent' && req.membership.status === 'active') {
    next();
  } else {
    res.status(403).json({ message: 'Not authorized as a parent for this family' });
  }
};
