
import Pool from 'pg-pool'
import util from 'util'
import url from 'url'
import config from './config.js'
// import PgQueryObserver from 'pg-query-observer'
// const pgp = require('pg-promise')()

// config for pool
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

module.exports.createCase = (subject, user, description, cb) => {
  let recordtypeid = '01239000000EB4NAAW'
  let createQuery = 'INSERT INTO salesforcesandbox.case(subject, ' +
    'creatorname, samanageesd__creatorname__c, samanageesd__requestername__c, ' +
    'description, recordtypeid, samanageesd__recordtype__c, origin) ' +
    'values($1, $2, $3, $4, $5, $6, $7, $8);'
  let args = [subject, user, user, user, description, recordtypeid, 'Incident', 'Slack']
  pool.query(createQuery, args)
  pool.query('LISTEN status;')
  console.log(' -- after query listener --')
  pool.on('notifification', (err, msg) => {
    if (err) console.log(err)
    console.log('~ notify ready fired ~')
    console.log('--> notification message: ', util.inspect(msg))
    return cb(null, msg)
  })
}

// observer for status field
// async function observe (subject) {
//   try {
//     let db = await pgp(config('DATABASE_URL'))
//     let queryObserver = new PgQueryObserver(db, 'status')
//     console.log('- Observing client now')

//     function triggers (change) {
//       console.log('- triggers', change)
//       return true
//     }

//     async function cleanupAndExit () {
//       await queryObserver.cleanup()
//       process.exit()
//     }

//     process.on('SIGTERM', cleanupAndExit)
//     process.on('SIGINT', cleanupAndExit)

//     let query = `SELECT * FROM salesforcesandbox.case WHERE subject = '${subject}'`
//     let params = []
//     let handle = await queryObserver.notify(query, params, triggers, diff => {
//       console.log('** QUERY NOTIFICATION: ', util.insepct(diff))
//     })

//     console.log('- handler rows:\n', handle.rows)
//     // await handle.stop()
//     // await queryObserver.cleanup()
//   } catch (err) {
//     console.error(err)
//   }
// }

// module.exports.query = (text, values) => {
//   return pool.query(text, values)
// }

// module.exports.createCase = (subject, user, description, cb) => {
//   let recordtypeid = '01239000000EB4NAAW'
//   let createQuery = 'INSERT INTO salesforcesandbox.case(subject, ' +
//     'creatorname, samanageesd__creatorname__c, samanageesd__requestername__c, ' +
//     'description, recordtypeid, samanageesd__recordtype__c, origin) ' +
//     'values($1, $2, $3, $4, $5, $6, $7, $8);'
//   let args = [subject, user, user, user, description, recordtypeid, 'Incident', 'Slack']
//   return pool.query(createQuery, args, (err, result) => {
//     if (err) cb(err)
//     observe(subject)
//     cb(null, result.rows[0])
//   })
//   // observe(subject)
//   // return cb(pool.query(createQuery, args))
// }

// module.exports.retrieveCase = (subject, cb) => {
//   let retrieveQuery = `SELECT * FROM salesforcesandbox.case WHERE subject = '${subject}'`
//   return pool.query(retrieveQuery, [], (err, result) => {
//     if (err) cb(err)
//     cb(null, result.rows[0])
//   })
//   // return cb(pool.query(retrieveQuery, []))
// }
