import { Router } from 'express';
import { createMemory, getMemories, deleteMemory } from '../controllers/memory.controller';
import { protect } from '../middlewares/auth.middleware';
import { validate, memorySchema } from '../middlewares/validation';

const router = Router();

router.get('/', protect, getMemories);
router.post('/', protect, validate(memorySchema), createMemory);
router.delete('/:id', protect, deleteMemory);

export default router;
