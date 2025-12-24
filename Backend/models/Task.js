const mongoose = require('mongoose')

const SubtaskSchema = new mongoose.Schema({
  text: String,
  done: { type: Boolean, default: false },
  dueDate: { type: Date },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { _id: true })

const ChecklistItemSchema = new mongoose.Schema({
  text: String,
  done: { type: Boolean, default: false }
}, { _id: true })

const AttachmentSchema = new mongoose.Schema({
  name: String,
  size: String,
  url: String
}, { _id: true })

const TaskSchema = new mongoose.Schema({
  bucketId: { type: mongoose.Schema.Types.ObjectId, ref: 'Bucket', required: true },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  completed: { type: Boolean, default: false },
  assignedTo: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  labels: [{ type: String }],
  priority: { type: String, enum: ['urgent','important','medium','low'], default: 'medium' },
  progress: { type: String, enum: ['not_started','in_progress','completed'], default: 'not_started' },
  startDate: { type: Date },
  dueDate: { type: Date },
  repeat: { type: String, default: 'does_not_repeat' },
  
  // Activity type for task management (SprintView chart)
  activityType: { type: String, default: 'ONE_TIME' },
  estimatedDays: {
    type: Number,
    default: 0,
    min: 0,
    validate: {
      validator: (v) => {
        if (v === null || v === undefined) return true;
        if (!Number.isFinite(v)) return false;
        // allow whole days and half-days only
        return Math.abs(v * 2 - Math.round(v * 2)) < 1e-9;
      },
      message: 'estimatedDays must be in 0.5-day increments'
    }
  },
  
  // Final Project Report fields
  actualStartDate: { type: Date },
  actualEndDate: { type: Date },
  completedAt: { type: Date },
  isFrozenInReport: { type: Boolean, default: false },
  
  // Subtasks
  subtasks: [SubtaskSchema],
  
  checklist: [ChecklistItemSchema],
  attachments: [AttachmentSchema],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
})

TaskSchema.pre('save', function (next) { this.updatedAt = Date.now(); next(); })

module.exports = mongoose.model('Task', TaskSchema)
