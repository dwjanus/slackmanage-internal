
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
  idleTimeoutMillis: 2000 // 2s idle timeout for clients
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
  console.log('~ Case created ~')
  pool.connect().then(client => {
    console.log('~ client acquired from pool ~')
    client.query('LISTEN status')
    console.log('~ listening to status ~')
    client.on('notification', data => {
      console.log(data.payload)
      cb(null, data.payload)
    })
    .catch(err => {
      cb(err, null)
    })
  })
}

module.exports.retrieveCase = (sfid, cb) => {
  let retrieveQuery = `SELECT * FROM salesforcesandbox.case WHERE sfid = '${sfid}'`
  console.log('retrieveQuery: ' + retrieveQuery)
  pool.query(retrieveQuery, [], (err, result) => {
    if (err) {
      cb(err, null)
      return
    }
    console.log('Retrieve Case result:\n', util.inspect(result))
    cb(null, result.rows[0])
  })
}
