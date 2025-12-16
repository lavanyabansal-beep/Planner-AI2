const mongoose = require('mongoose')
const dotenv = require('dotenv')
dotenv.config()

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/planner'

async function connectDB() {
  try {
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    })
    console.log('MongoDB connected')
  } catch (err) {
    console.error('MongoDB connection error', err)
    process.exit(1)
  }
}

module.exports = { connectDB }
