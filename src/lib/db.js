
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
  poolSize: 20,
  poolIdleTimeout: 8000
}
const db = pgp(pgConfig)
const recordtypeid = '01239000000EB4NAAW'
const createQuery = 'INSERT INTO salesforce.case(subject, ' +
      'samanageesd__creatorname__c, samanageesd__requestername__c, ' +
      'samanageesd__requesteruser__c, samnageesd__requester__c' +
      'description, recordtypeid, samanageesd__recordtype__c, origin) ' +
      'values($1, $2, $3, $4, $5, $6, $7, $8, $9)'

const retrieveCase = () => {
  return new Promise((resolve, reject) => {
    console.log('--> retrieveCase function')
    let sco
    return db.connect()
    .then(obj => {
      sco = obj
      sco.client.on('notification', data => {
        console.log('--> Recieved trigger data')
        sco.done()
        resolve(JSON.parse(data.payload))
      })
      return sco.none('LISTEN status')
    })
    .catch(err => {
      reject(err)
    })
  })
}

module.exports.createCase = (subject, user, description) => { // add email parameter for droduction
  console.log('--> createCase function')
  return db.task(t => {
    console.log('~ 1. DB.task ~')
    return t.one(`SELECT sfid, contactid FROM salesforce.user WHERE name = $1`, user) // AND email = $2
    .then(userIds => {
      if (!userIds.sfid && !userIds.sfid) {
        console.log(`SFID and ContactId not found for user: ${user}`)
        // IF USER DOESNT EXIST THEN WE MAKE REQUESTER THE BOT -> ADD unknown user/email into sf
      } else {
        console.log(`~ 2. DB.task.then -> userId: ${util.inspect(userIds.sfid)} - ${util.inspect(userIds.contactid)} ~`)
        let args = [subject, user, user, userIds.sfid, userIds.contactid, description, recordtypeid, 'Incident', 'Slack']
        return t.none(createQuery, args)
        .then(() => {
          return retrieveCase().then(data => {
            console.log('~ 4. task.then - Retrieve Case data:\n', util.inspect(data))
            return data
          })
        })
      }
    })
  })
  .catch(err => {
    console.log(err)
  })
}

// db.connect({direct: true})
// .then(sco => {
//   console.log('Listener is awaiting closed notification...')
//   sco.client.on('notification', data => {
//     console.log('Received closed notification:', util.inspect(JSON.parse(data.payload)))
//     // return data.payload
//   })
//   return sco.none('LISTEN closed')
// })
// .catch(error => {
//   console.log('Error:', error)
// })

