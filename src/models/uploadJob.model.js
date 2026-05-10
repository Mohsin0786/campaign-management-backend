import mongoose, { Schema } from "mongoose";

const uploadJobSchema = new Schema(
  {
    fileName: { type: String, required: true },
    s3Key: { type: String }, // set after presign, used by worker
    status: {
      type: String,
      enum: ["pending", "queued", "processing", "done", "failed"],
      default: "pending",
    },
    totalRows: { type: Number, default: 0 },
    successCount: { type: Number, default: 0 },
    failureCount: { type: Number, default: 0 },
    errors: { type: [String], default: [] }, // first 50 errors only
  },
  { timestamps: true },
);

uploadJobSchema.index({ status: 1, createdAt: -1 });

export default mongoose.model("UploadJob", uploadJobSchema);
