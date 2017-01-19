
import Promise from 'bluebird'
import url from 'url'
import util from 'util'
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
  poolIdleTimeout: 8000
}
const db = pgp(pgConfig)
const recordtypeid = '01239000000EB4NAAW'
const createQuery = 'INSERT INTO salesforcesandbox.case(subject, ' +
      'samanageesd__creatorname__c, samanageesd__requesteruser__c, ' +
      'description, recordtypeid, samanageesd__recordtype__c, origin) ' +
      'values($1, $2, $3, $4, $5, $6, $7)'

const retrieveCase = () => {
  return new Promise((resolve, reject) => {
    console.log('--> retrieveCase function')
    let sco
    return db.connect()
    .then(obj => {
      sco = obj
      sco.client.on('notification', data => {
        console.log('--> Recieved trigger data: ', data.payload)
        return sco.one(`SELECT * FROM salesforcesandbox.case WHERE sfid = '${data.payload}'`)
        .then(data => {
          sco.done()
          console.log(`~ 3. case retrieved via select, data:\n${util.inspect(data)}`)
          resolve(data)
        })
      })
      return sco.none('LISTEN status')
    })
    .catch(err => {
      reject(err)
    })
  })
}

module.exports.createCase = (subject, user, email, description) => {
  console.log('--> createCase function')
  return db.task(t => {
    console.log('~ 1. DB.task ~')
    return t.one(`SELECT sfid FROM salesforcesandbox.user WHERE name = $1 AND email = $2`, [user, email])
    .then(userId => {
      console.log(`~ 2. DB.task.then -> userId: ${util.inspect(userId.sfid)} ~`)
      let args = [subject, user, userId.sfid, description, recordtypeid, 'Incident', 'Slack']
      return t.none(createQuery, args)
      .then(() => {
        return retrieveCase().then(data => {
          console.log('~ 4. task.then - Retrieve Case data:\n', util.inspect(data))
          return data
        })
      })
    })
  })
  .catch(err => {
    console.log(err)
  })
}

