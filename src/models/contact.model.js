import mongoose, { Schema } from "mongoose";

const contactSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
    },
    phone: { type: String, trim: true },
    tags: { type: [String], default: [] },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

// Text search across name + email
contactSchema.index({ name: "text", email: "text" });

// Audience filter: tag + date compound multikey
contactSchema.index({ tags: 1, createdAt: -1 });

// Date-only filter fallback
contactSchema.index({ createdAt: -1 });

export default mongoose.model("Contact", contactSchema);
