import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';

export const createFamilySchema = z.object({
  babyName: z.string().min(1, 'Baby name is required').max(50, 'Baby name too long'),
  babyDob: z.string().optional().refine((val) => !val || !isNaN(Date.parse(val)), 'Invalid date format'),
  relationshipToBaby: z.string().max(50).optional(),
});

export const joinFamilySchema = z.object({
  inviteCode: z.string().length(12, 'Invite code must be 12 characters').regex(/^[A-F0-9]+$/i, 'Invalid invite code format'),
  relationshipToBaby: z.string().max(50).optional(),
});

export const updateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  relationshipToBaby: z.string().max(50).optional(),
  nickname: z.string().max(50).optional(),
});

export const memorySchema = z.object({
  title: z.string().min(1, 'Title is required').max(200, 'Title too long'),
  description: z.string().max(5000, 'Story too long').optional(),
  date: z.string().optional().refine((val) => !val || !isNaN(Date.parse(val)), 'Invalid date format'),
  tags: z.array(z.string().max(30)).max(10).optional(),
});

export function validate(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const message = result.error.issues.map((e: z.ZodIssue) => e.message).join(', ');
      res.status(400).json({ message });
      return;
    }
    req.body = result.data;
    next();
  };
}
