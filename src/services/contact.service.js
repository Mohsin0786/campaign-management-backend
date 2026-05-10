import Contact from "../models/contact.model.js";

/**
 * List contacts with cursor-based pagination, full-text search, and filters.
 * Uses cursor (_id) instead of skip/limit — O(log n) at any page depth.
 */
export async function listContacts({
  search,
  tags,
  createdAfter,
  createdBefore,
  cursor,
  limit = 20,
}) {
  const filter = {};

  // Uses { name: "text", email: "text" } index
  if (search) filter.$text = { $search: search };

  // Hits { tags, createdAt } compound multikey index
  if (tags?.length) filter.tags = { $in: tags };

  // Cursor: jump directly to position, no scan of previous pages
  if (cursor) filter._id = { $gt: cursor };

  if (createdAfter || createdBefore) {
    filter.createdAt = {};
    if (createdAfter) filter.createdAt.$gte = new Date(createdAfter);
    if (createdBefore) filter.createdAt.$lte = new Date(createdBefore);
  }

  const parsedLimit = Math.min(parseInt(limit) || 20, 100);

  const contacts = await Contact.find(filter)
    .sort({ _id: 1 })
    .limit(parsedLimit + 1) // fetch one extra to determine hasNextPage
    .lean();

  const hasNextPage = contacts.length > parsedLimit;
  if (hasNextPage) contacts.pop();

  return {
    data: contacts,
    nextCursor: hasNextPage ? contacts[contacts.length - 1]._id : null,
    hasNextPage,
    count: contacts.length,
  };
}

/**
 * Build MongoDB filter from audienceFilter config.
 * Used by campaign service to count + stream audience contacts.
 */
export function buildAudienceFilter(audienceFilter = {}) {
  const filter = {};
  if (audienceFilter.tags?.length) filter.tags = { $in: audienceFilter.tags };
  if (audienceFilter.createdAfter)
    filter.createdAt = {
      ...(filter.createdAt || {}),
      $gte: new Date(audienceFilter.createdAfter),
    };
  if (audienceFilter.createdBefore)
    filter.createdAt = {
      ...(filter.createdAt || {}),
      $lte: new Date(audienceFilter.createdBefore),
    };
  return filter;
}
