import mongoose, { Schema } from "mongoose";

const contactSubmissionSchema = new Schema(
  {
    name: { type: String, required: true, maxlength: 100, trim: true },
    email: { type: String, required: true, maxlength: 254, lowercase: true, trim: true, index: true },
    company: { type: String, maxlength: 120, trim: true },
    subject: { type: String, required: true, maxlength: 160, trim: true },
    message: { type: String, required: true, maxlength: 4000, trim: true },
    notificationStatus: { type: String, enum: ["PENDING", "SENT", "FAILED"], default: "PENDING" },
    notificationId: String,
    notificationError: String,
  },
  { timestamps: true, collection: "contact_submissions" },
);

export const ContactSubmission =
  mongoose.models.ContactSubmission ||
  mongoose.model("ContactSubmission", contactSubmissionSchema);
