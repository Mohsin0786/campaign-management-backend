/**
 * Query explain plans — Section 10 of assignment spec (highest weight)
 * Run: npm run explain  (after seeding with npm run seed)
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import Contact  from '../src/models/contact.model.js';
import Message  from '../src/models/message.model.js';
import Campaign from '../src/models/campaign.model.js';

await mongoose.connect(process.env.MONGO_URI);
console.log('Running explain plans...\n');

function printExplain(label, explain) {
  const stats = explain.executionStats;
  const plan  = explain.queryPlanner.winningPlan;
  const getIndex = (p) => p?.indexName || (p?.inputStage ? getIndex(p.inputStage) : 'COLLSCAN ⚠️');

  console.log(`━━ ${label}`);
  console.log(`   Index used:     ${getIndex(plan)}`);
  console.log(`   Keys examined:  ${stats?.totalKeysExamined ?? 'N/A'}`);
  console.log(`   Docs examined:  ${stats?.totalDocsExamined ?? 'N/A'}`);
  console.log(`   Docs returned:  ${stats?.nReturned ?? 'N/A'}`);
  console.log(`   Exec time:      ${stats?.executionTimeMillis ?? 'N/A'}ms`);
  console.log(`   Stage:          ${plan.stage}`);
  console.log();
}

// Q1: Contact text search + tag filter
try {
  const q1 = await Contact
    .find({ $text: { $search: 'James' }, tags: 'vip' })
    .sort({ createdAt: -1 })
    .explain('executionStats');
  printExplain('Q1: Contact text search + tag filter', q1);
} catch (e) { console.log('Q1 skipped:', e.message, '\n'); }

// Q2: Audience selection — tag-based campaign targeting
try {
  const q2 = await Contact
    .find({ tags: { $in: ['vip', 'enterprise'] } })
    .select('_id')
    .explain('executionStats');
  printExplain('Q2: Audience selection by tags', q2);
} catch (e) { console.log('Q2 skipped:', e.message, '\n'); }

// Q3: Cursor-based paginated listing
try {
  const q3 = await Contact
    .find({ _id: { $gt: new mongoose.Types.ObjectId('000000000000000000000000') } })
    .sort({ _id: 1 })
    .limit(21)
    .explain('executionStats');
  printExplain('Q3: Cursor-based paginated contact listing', q3);
} catch (e) { console.log('Q3 skipped:', e.message, '\n'); }

// Q4: Campaign stats aggregation
try {
  const anyCampaign = await Campaign.findOne().lean();
  if (anyCampaign) {
    const q4 = await Message.aggregate([
      { $match: { campaignId: anyCampaign._id, status: { $in: ['sent', 'failed'] } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]).explain('executionStats');

    console.log('━━ Q4: Campaign stats aggregation');
    const cursor = q4.stages?.[0]?.$cursor?.executionStats;
    if (cursor) {
      console.log(`   Docs examined: ${cursor.totalDocsExamined}`);
      console.log(`   Docs returned: ${cursor.nReturned}`);
      console.log(`   Exec time:     ${cursor.executionTimeMillis}ms`);
    } else {
      console.log(JSON.stringify(q4, null, 2));
    }
    console.log();
  } else {
    console.log('Q4 skipped: no campaigns found — run seed first\n');
  }
} catch (e) { console.log('Q4 skipped:', e.message, '\n'); }

// Q5: Dashboard campaign list by status
try {
  const q5 = await Campaign
    .find({ status: 'running' })
    .sort({ createdAt: -1 })
    .explain('executionStats');
  printExplain('Q5: Dashboard campaign list by status', q5);
} catch (e) { console.log('Q5 skipped:', e.message, '\n'); }

// Q6: Analytics — messages sent over time (hourly aggregation)
try {
  const anyCampaign = await Campaign.findOne().lean();
  if (anyCampaign) {
    const q6 = await Message.aggregate([
      {
        $match: {
          campaignId: anyCampaign._id,
          status:     { $in: ['sent', 'failed'] },
        },
      },
      {
        $group: {
          _id: {
            hour:   { $dateToString: { format: '%Y-%m-%dT%H:00', date: '$createdAt' } },
            status: '$status',
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.hour': 1 } },
    ]).explain('executionStats');

    console.log('━━ Q6: Analytics — messages sent over time');
    const cursor = q6.stages?.[0]?.$cursor?.executionStats;
    if (cursor) {
      console.log(`   Index used:    ${cursor.executionStages?.indexName || 'N/A'}`);
      console.log(`   Docs examined: ${cursor.totalDocsExamined}`);
      console.log(`   Docs returned: ${cursor.nReturned}`);
      console.log(`   Exec time:     ${cursor.executionTimeMillis}ms`);
    } else {
      console.log(JSON.stringify(q6, null, 2));
    }
    console.log();
  } else {
    console.log('Q6 skipped: no campaigns found — run seed first\n');
  }
} catch (e) { console.log('Q6 skipped:', e.message, '\n'); }

// Q7: Contact search by email
try {
  const q7 = await Contact
    .find({ email: 'test@example.com' })
    .explain('executionStats');
  printExplain('Q7: Contact lookup by email (unique index)', q7);
} catch (e) { console.log('Q7 skipped:', e.message, '\n'); }

await mongoose.disconnect();
console.log('Done. Paste this output into your README Query Performance Report.');
