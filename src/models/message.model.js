import mongoose, { Schema } from "mongoose";

const messageSchema = new Schema(
  {
    campaignId: {
      type: Schema.Types.ObjectId,
      ref: "Campaign",
      required: true,
    },
    contactId: { type: Schema.Types.ObjectId, ref: "Contact", required: true },
    status: {
      type: String,
      enum: ["queued", "processing", "sent", "failed"],
      default: "queued",
    },
    retryCount: { type: Number, default: 0 },
    errorReason: { type: String },
    sentAt: { type: Date },
  },
  { timestamps: true },
);

// Most critical — powers all worker + dashboard queries
messageSchema.index({ campaignId: 1, status: 1 });

// Idempotency guard — prevents double sends on worker retry
messageSchema.index({ campaignId: 1, contactId: 1 }, { unique: true });

// Analytics: messages over time per campaign
messageSchema.index({ campaignId: 1, createdAt: -1 });

// Cross-campaign retry worker sweep
messageSchema.index({ status: 1, retryCount: 1 });

export default mongoose.model("Message", messageSchema);
