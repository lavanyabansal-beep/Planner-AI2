const mongoose = require('mongoose')

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String },
  initials: { type: String },
  avatarColor: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
})

UserSchema.pre('save', function (next) { this.updatedAt = Date.now(); next(); })

module.exports = mongoose.model('User', UserSchema)
