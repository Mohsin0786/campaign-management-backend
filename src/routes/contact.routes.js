import { Router } from 'express';
import { listContacts } from '../services/contact.service.js';

const router = Router();

/**
 * GET /api/contacts
 * Query params: search, tags (comma-separated), createdAfter, createdBefore, cursor, limit
 */
router.get('/', async (req, res, next) => {
  try {
    const { search, tags, createdAfter, createdBefore, cursor, limit } = req.query;
    const parsedTags = tags
      ? (Array.isArray(tags) ? tags : tags.split(',').filter(Boolean))
      : undefined;

    const result = await listContacts({
      search, tags: parsedTags, createdAfter, createdBefore, cursor, limit,
    });
    res.json(result);
  } catch (err) { next(err); }
});

export default router;
