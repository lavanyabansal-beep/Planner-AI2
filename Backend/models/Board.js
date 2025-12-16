const mongoose = require('mongoose')

const BoardSchema = new mongoose.Schema({
  teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
  title: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
})

BoardSchema.pre('save', function (next) { this.updatedAt = Date.now(); next(); })

module.exports = mongoose.model('Board', BoardSchema)
