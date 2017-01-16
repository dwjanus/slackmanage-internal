
import Pool from 'pg-pool'
import util from 'util'
import url from 'url'
import config from './config.js'

// config for pool
const params = url.parse(config('DATABASE_URL'))
const auth = params.auth.split(':')
const pgConfig = {
  user: auth[0],
  password: auth[1],
  host: params.hostname,
  port: params.port,
  database: params.pathname.split('/')[1],
  max: 20,
  ssl: true,
  idleTimeoutMillis: 500 // .5s idle timeout for clients
}
const pool = new Pool(pgConfig)

function retrieveCase (sfid, cb) {
  let retrieveQuery = `SELECT * FROM salesforcesandbox.case WHERE sfid = '${sfid}'`
  pool.query(retrieveQuery, [], (err, result) => {
    if (err) {
      cb(err, null)
      return
    }
    console.log('Retrieve Case result:\n', util.inspect(result.rows[0]))
    cb(null, result.rows[0])
  })
}

// module.exports.createCase = (subject, user, description, cb) => {
//   let recordtypeid = '01239000000EB4NAAW'
//   let createQuery = 'INSERT INTO salesforcesandbox.case(subject, ' +
//     'creatorname, samanageesd__creatorname__c, samanageesd__requestername__c, ' +
//     'description, recordtypeid, samanageesd__recordtype__c, origin) ' +
//     'values($1, $2, $3, $4, $5, $6, $7, $8);'
//   let args = [subject, user, user, user, description, recordtypeid, 'Incident', 'Slack']
//   pool.query(createQuery, args)
//   console.log('~ Case created ~')
//   pool.connect().then(client => {
//     client.query('LISTEN status')
//     client.on('notification', data => {
//       console.log('-- notification fired, data.payload:\n', data.payload)
//       client.release()
//       console.log('-- client released, calling back results --')
//       retrieveCase(data.payload, cb)
//     })
//     .catch(err => {
//       client.release()
//       cb(err, null)
//     })
//   })
// }

module.exports.createCase = (subject, user, description, cb) => {
  pool.query(`SELECT sfid FROM salesforcesandbox.user WHERE name ='${user}'`, (err, res) => {
    if (err) console.log(err)
    console.log('User search response:\n' + util.inspect(res.rows[0]))
    let userId = res.rows[0].sfid
    let recordtypeid = '01239000000EB4NAAW'
    let createQuery = 'INSERT INTO salesforcesandbox.case(subject, ' +
      'creatorname, samanageesd__creatorname__c, samanageesd__requesteruser__c, ' +
      'description, recordtypeid, samanageesd__recordtype__c, origin) ' +
      'values($1, $2, $3, $4, $5, $6, $7, $8);'
    let args = [subject, user, user, userId, description, recordtypeid, 'Incident', 'Slack']
    pool.query(createQuery, args)
    console.log('~ Case created ~')
    pool.connect().then(client => {
      client.query('LISTEN status')
      client.on('notification', data => {
        console.log('-- notification fired, data.payload:\n', data.payload)
        client.release()
        console.log('-- client released, calling back results --')
        retrieveCase(data.payload, cb)
      })
      .catch(err => {
        client.release()
        cb(err, null)
      })
    })
  })
}

