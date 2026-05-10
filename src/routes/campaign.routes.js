import { Router } from 'express';
import { validate, schemas } from '../middleware/validate.js';
import {
  createCampaign,
  listCampaigns,
  getCampaignById,
  startCampaign,
  getCampaignAnalytics,
} from '../services/campaign.service.js';

const router = Router();

// POST /api/campaigns
router.post('/', validate(schemas.createCampaign), async (req, res, next) => {
  try {
    const campaign = await createCampaign(req.body);
    res.status(201).json(campaign);
  } catch (err) { next(err); }
});

// GET /api/campaigns?status=running&cursor=&limit=
router.get('/', async (req, res, next) => {
  try {
    const { status, cursor, limit } = req.query;
    const result = await listCampaigns({ status, cursor, limit });
    res.json(result);
  } catch (err) { next(err); }
});

// GET /api/campaigns/:id
router.get('/:id', async (req, res, next) => {
  try {
    const campaign = await getCampaignById(req.params.id);
    res.json(campaign);
  } catch (err) { next(err); }
});

// POST /api/campaigns/:id/start
router.post('/:id/start', async (req, res, next) => {
  try {
    const result = await startCampaign(req.params.id);
    res.json(result);
  } catch (err) { next(err); }
});

// GET /api/campaigns/:id/analytics
router.get('/:id/analytics', async (req, res, next) => {
  try {
    const data = await getCampaignAnalytics(req.params.id);
    res.json(data);
  } catch (err) { next(err); }
});

export default router;
