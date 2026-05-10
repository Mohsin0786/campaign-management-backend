import mongoose from 'mongoose';
import Campaign from '../models/campaign.model.js';
import Contact from '../models/contact.model.js';
import Message from '../models/message.model.js';
import { campaignQueue } from '../queues/campaign.queue.js';
import { redis } from '../config/redis.js';
import { buildAudienceFilter } from './contact.service.js';

const STATS_CACHE_TTL = 5; // seconds

export async function createCampaign(data) {
  return Campaign.create(data);
}

export async function listCampaigns({ status, cursor, limit = 20 }) {
  const filter = {};
  if (status) filter.status = status;
  if (cursor) filter._id = { $lt: cursor }; // descending → $lt

  const parsedLimit = Math.min(parseInt(limit) || 20, 100);

  const campaigns = await Campaign
    .find(filter)
    .sort({ createdAt: -1 })
    .limit(parsedLimit + 1)
    .lean();

  const hasNextPage = campaigns.length > parsedLimit;
  if (hasNextPage) campaigns.pop();

  return {
    data:       campaigns,
    nextCursor: hasNextPage ? campaigns[campaigns.length - 1]._id : null,
    hasNextPage,
  };
}

export async function startCampaign(campaignId) {
  const campaign = await Campaign.findById(campaignId);
  if (!campaign)
    throw Object.assign(new Error('Campaign not found'), { status: 404 });
  if (campaign.status !== 'draft')
    throw Object.assign(new Error(`Campaign is already ${campaign.status}`), { status: 409 });

  const filter     = buildAudienceFilter(campaign.audienceFilter);
  const totalCount = await Contact.countDocuments(filter);

  if (totalCount === 0)
    throw Object.assign(new Error('No contacts match the audience filter'), { status: 400 });

  // Enqueue FIRST — if this fails, campaign stays in 'draft' and can be retried
  // jobId deduplication — same campaign can't be enqueued twice
  await campaignQueue.add(
    'send',
    { campaignId: campaignId.toString() },
    { jobId: `campaign-${campaignId}` },
  );

  // Update status AFTER successful enqueue — prevents orphaned "running" campaigns
  await Campaign.findByIdAndUpdate(campaignId, {
    status:'running',
    totalCount,
    pendingCount: totalCount,
    startedAt:    new Date(),
  });

  return { queued: true, totalCount };
}

export async function getCampaignById(campaignId) {
  const cacheKey = `campaign:stats:${campaignId}`;
  const cached   = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const campaign = await Campaign.findById(campaignId).lean();
  if (!campaign)
    throw Object.assign(new Error('Campaign not found'), { status: 404 });

  // Cache for 5s — absorbs burst polling from multiple dashboard tabs
  await redis.setex(cacheKey, STATS_CACHE_TTL, JSON.stringify(campaign));
  return campaign;
}

export async function getCampaignAnalytics(campaignId) {
  // Hits { campaignId, createdAt } compound index
  const hourly = await Message.aggregate([
    {
      $match: {
        campaignId: new mongoose.Types.ObjectId(campaignId),
        status:     { $in: ['sent', 'failed'] },
      },
    },
    {
      $group: {
        _id: {
          // Use createdAt to leverage existing { campaignId, createdAt } index
          hour:   { $dateToString: { format: '%Y-%m-%dT%H:00', date: '$createdAt' } },
          status: '$status',
        },
        count: { $sum: 1 },
      },
    },
    { $sort: { '_id.hour': 1 } },
  ]);

  // Pivot to { hour, sent, failed } for frontend chart
  const map = {};
  for (const row of hourly) {
    const h = row._id.hour;
    if (!map[h]) map[h] = { hour: h, sent: 0, failed: 0 };
    map[h][row._id.status] = row.count;
  }

  return Object.values(map);
}
