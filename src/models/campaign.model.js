import mongoose, { Schema } from 'mongoose';

const campaignSchema = new Schema({
  name:            { type: String, required: true, trim: true },
  messageTemplate: { type: String, required: true },
  status: {
    type:    String,
    enum:    ['draft', 'running', 'paused', 'completed', 'failed'],
    default: 'draft',
  },
  audienceFilter: { type: Schema.Types.Mixed, default: {} },

  // Denormalized counters — O(1) dashboard reads, no count() on messages
  totalCount:   { type: Number, default: 0 },
  sentCount:    { type: Number, default: 0 },
  failedCount:  { type: Number, default: 0 },
  pendingCount: { type: Number, default: 0 },

  startedAt:   { type: Date },
  completedAt: { type: Date },
}, { timestamps: true });

// Dashboard list: filter by status + sort newest first
campaignSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model('Campaign', campaignSchema);
