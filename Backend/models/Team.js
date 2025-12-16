const mongoose = require('mongoose')

const TeamSchema = new mongoose.Schema({
  name: { type: String, required: true },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
})

TeamSchema.pre('save', function (next) { this.updatedAt = Date.now(); next(); })

module.exports = mongoose.model('Team', TeamSchema)
