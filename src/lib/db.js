
import Pool from 'pg-pool'
import util from 'util'
import url from 'url'
import config from './config.js'

const params = url.parse(config('DATABASE_URL'))
const auth = params.auth.split(':')
const pgConfig = {
  user: auth[0],
  password: auth[1],
  host: params.hostname,
  port: params.port,
  database: params.pathname.split('/')[1],
  max: 10,
  ssl: true
}

const pool = new Pool(pgConfig)
pool.query('LISTEN status')
pool.on('notify_ready', (msg) => {
  console.log('** status change registered in db.js: ' + util.inspect(msg))
})

module.exports.query = (text, values) => {
  return pool.query(text, values)
}
