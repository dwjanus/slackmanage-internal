
import Promise from 'bluebird'
import url from 'url'
import config from './config.js'
let pgp = require('pg-promise')({
  promiseLib: Promise
})

// config for pool
const params = url.parse(config('DATABASE_URL'))
const auth = params.auth.split(':')
const pgConfig = {
  user: auth[0],
  password: auth[1],
  database: params.pathname.split('/')[1],
  host: params.hostname,
  port: params.port,
  ssl: true,
  poolSize: 20,
  poolIdleTimeout: 2000
}
const db = pgp(pgConfig)
const recordtypeid = '01239000000EB4NAAW'
const createQuery = 'INSERT INTO salesforce.case(subject, ' +
      'samanageesd__creatorname__c, samanageesd__requestername__c, ' +
      'samanageesd__requesteruser__c, description, ' +
      'recordtypeid, samanageesd__recordtype__c, origin) ' +
      'values($1, $2, $3, $4, $5, $6, $7, $8)'

module.exports.createCase = (subject, user, email, description) => { // add email parameter for production
  return db.task(t => {
    return t.one(`SELECT sfid FROM salesforce.user WHERE name = $1 OR email = $2`, [user, email])
    .then(userIds => {
      if (!userIds.sfid) {
        throw new Error(`SFID not found for user: ${user} ~ email: ${email}`)
      } else {
        let args = [subject, user, user, userIds.sfid, description, recordtypeid, 'Incident', 'Slack']
        return t.none(createQuery, args)
      }
    })
  })
  .catch(err => {
    console.log(err)
  })
}
