const mongoose = require('mongoose')

const BucketSchema = new mongoose.Schema({
  boardId: { type: mongoose.Schema.Types.ObjectId, ref: 'Board', required: true },
  title: { type: String, required: true },
  order: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
})

BucketSchema.pre('save', function (next) { this.updatedAt = Date.now(); next(); })

module.exports = mongoose.model('Bucket', BucketSchema)
