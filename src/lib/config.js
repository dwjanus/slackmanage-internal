
import dotenv from 'dotenv'
const ENV = process.env.NODE_ENV || 'development'

if (ENV === 'development') dotenv.load()

const config = {
  ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  PROXY_URI: process.env.PROXY_URI,
  SLACK_CLIENT_ID: process.env.CLIENT_ID,
  SLACK_CLIENT_SECRET: process.env.CLIENT_SECRET,
  MONGODB_URI: process.env.MONGODB_URI,
  APIAI_DEV_TOKEN: process.env.APIAI_DEV_TOKEN
}

export default (key) => {
  if (!key) return config
  return config[key]
}
