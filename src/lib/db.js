
import Pool from 'pg-pool'
import util from 'util'
import url from 'url'
import config from './config.js'
import PgQueryObserver from 'pg-query-observer'

// config
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

// establish connection to db and stand up our observer
async function observe (subject, user) {
  try {
    const queryObserver = new PgQueryObserver(pool, 'status')

    function triggers (change) {
      console.log('triggers', change)
      return true
    }

    async function cleanupAndExit () {
      await queryObserver.cleanup()
      process.exit()
    }

    process.on('SIGTERM', cleanupAndExit)
    process.on('SIGINT', cleanupAndExit)

    let query = `SELECT * FROM salesforcesandbox.case WHERE subject = '${subject}' AND user = '${user}'`
    let params = []
    let handle = await queryObserver.notify(query, params, triggers, diff => {
      console.log('** QUERY NOTIFY: ', util.insepct(diff))
    })

    console.log('handler rows', handle.rows)
    await handle.stop()
    await queryObserver.cleanup()
  } catch (err) {
    console.error(err)
  }
}

module.exports.query = (text, values) => {
  return pool.query(text, values)
}

module.exports.createCase = (subject, user, description, cb) => {
  let recordtypeid = '01239000000EB4NAAW'
  let createQuery = 'INSERT INTO salesforcesandbox.case(subject, ' +
    'creatorname, samanageesd__creatorname__c, samanageesd__requestername__c, ' +
    'description, recordtypeid, samanageesd__recordtype__c, origin) ' +
    'values($1, $2, $3, $4, $5, $6, $7, $8);'
  let args = [subject, user, user, user, description, recordtypeid, 'Incident', 'Slack']
  pool.query(createQuery, args, (err, result) => {
    if (err) return cb(err)
    observe(subject, user)
    .then(() => {
      console.log('** Observer finished Observing, returning query response now') // console.log('Response from Observer:\n', util.inspect(res))
      cb(null, result.rows[0])
    })
  })
}

module.exports.retrieveCase = (subject, user, cb) => {
  let retrieveQuery = `SELECT * FROM salesforcesandbox.case WHERE subject = '${subject}' AND user = '${user}'`
  pool.query(retrieveQuery, [], (err, result) => {
    if (err) cb(err)
    cb(null, result.rows[0])
  })
}
