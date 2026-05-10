/**
 * Seed script — inserts 100k contacts for performance testing
 * Run: npm run seed
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import Contact from '../src/models/contact.model.js';

await mongoose.connect(process.env.MONGO_URI);
console.log('Connected. Seeding 100k contacts...\n');

const TAGS    = ['vip', 'enterprise', 'trial', 'churned', 'active', 'newsletter'];
const DOMAINS = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'company.com'];
const BATCH   = 1000;
const TOTAL   = 100_000;

let inserted = 0;
const start  = Date.now();

for (let b = 0; b < TOTAL / BATCH; b++) {
  const docs = Array.from({ length: BATCH }, (_, i) => {
    const idx = b * BATCH + i;
    return {
      name:  `User ${idx}`,
      email: `user${idx}@${DOMAINS[idx % DOMAINS.length]}`,
      phone: `+91${String(9000000000 + idx).slice(-10)}`,
      tags:  [TAGS[idx % TAGS.length], TAGS[(idx + 1) % TAGS.length]],
      metadata: { source: 'seed', batch: b },
    };
  });

  await Contact.insertMany(docs, { ordered: false }).catch(() => {});
  inserted += BATCH;

  if (inserted % 10_000 === 0) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`  ${inserted.toLocaleString()} / ${TOTAL.toLocaleString()} (${elapsed}s)`);
  }
}

console.log(`\nDone — ${inserted.toLocaleString()} contacts seeded in ${((Date.now() - start) / 1000).toFixed(1)}s`);
await mongoose.disconnect();
