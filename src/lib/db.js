
import promise from 'bluebird'
import url from 'url'
import util from 'util'
import config from './config.js'
const pgp = require('pg-promise')({
  promiseLib: promise
})

// config for pool
const params = url.parse(config('DATABASE_URL'))
const auth = params.auth.split(':')
const pgConfig = {
  user: auth[0],
  password: auth[1],
  host: params.hostname,
  port: params.port,
  database: params.pathname.split('/')[1],
  poolSize: 20,
  ssl: true,
  idleTimeoutMillis: 500 // .5s idle timeout for clients
}
const db = pgp(pgConfig)
const recordtypeid = '01239000000EB4NAAW'
const createQuery = 'INSERT INTO salesforcesandbox.case(subject, ' +
      'samanageesd__creatorname__c, samanageesd__requesteruser__c, ' +
      'description, recordtypeid, samanageesd__recordtype__c, origin) ' +
      'values($1, $2, $3, $4, $5, $6, $7);'

function retrieveCase (sfid, cb) {
  let retrieveQuery = `SELECT * FROM salesforcesandbox.case WHERE sfid = '${sfid}'`
  db.one(retrieveQuery)
  .then(data => {
    cb(null, data.rows[0])
  })
  .catch(err => {
    cb(err, null)
  })
}

module.exports.createCase = (subject, user, description, cb) => {
  // db.connect({direct: true}) // if this works we can use it to globally listen to triggers for new status
  // .then(sco => {
  //   sco.client.on('notification', data => {
  //     console.log('Recieved trigger data: ', data)
  //     retrieveCase(data.payload, cb)
  //   })
  //   return sco.none('LISTEN status')
  // })
  // .catch(err => {
  //   console.log(err)
  // })

  db.task((t) => {
    return t.one(`SELECT sfid FROM salesforcesandbox.user WHERE name ='${user}'`)
    .then(userId => {
      let args = [subject, user, userId, description, recordtypeid, 'Incident', 'Slack']
      return t.none(createQuery, args)
    })
  })

  .then(events => {
    console.log('Done with tasks - awaiting listener -\n', util.inspect(events))
    let sco
    db.connect()
    .then(obj => {
      sco = obj
      sco.client.on('notification', data => {
        console.log('Recieved trigger data: ', data)
        retrieveCase(data.payload, cb)
      })
      return sco.none('LISTEN status')
    })
    .catch(err => {
      cb(err, null)
    })
    .finally(() => {
      if (sco) sco.done()
    })
  })
  .catch(err => {
    cb(err, null)
  })
}

// import Pool from 'pg-pool'
// import url from 'url'
// import config from './config.js'

// // config for pool
// const params = url.parse(config('DATABASE_URL'))
// const auth = params.auth.split(':')
// const pgConfig = {
//   user: auth[0],
//   password: auth[1],
//   host: params.hostname,
//   port: params.port,
//   database: params.pathname.split('/')[1],
//   max: 20,
//   ssl: true,
//   idleTimeoutMillis: 500 // .5s idle timeout for clients
// }
// const pool = new Pool(pgConfig)

// const recordtypeid = '01239000000EB4NAAW'
// const createQuery = 'INSERT INTO salesforcesandbox.case(subject, ' +
//       'samanageesd__creatorname__c, samanageesd__requesteruser__c, ' +
//       'description, recordtypeid, samanageesd__recordtype__c, origin) ' +
//       'values($1, $2, $3, $4, $5, $6, $7);'

// function retrieveCase (sfid, cb) {
//   let retrieveQuery = `SELECT * FROM salesforcesandbox.case WHERE sfid = '${sfid}'`
//   pool.query(retrieveQuery, [], (err, result) => {
//     if (err) cb(err, null)
//     else cb(null, result.rows[0])
//   })
// }

// module.exports.createCase = (subject, user, description, cb) => {
//   pool.query(`SELECT sfid FROM salesforcesandbox.user WHERE name ='${user}'`, (err, res) => {
//     if (err) console.log(err)
//     let userId = res.rows[0].sfid
//     let args = [subject, user, userId, description, recordtypeid, 'Incident', 'Slack']
//     pool.query(createQuery, args)
//     console.log('~ Case created ~')
//     pool.connect().then(client => {
//       client.query('LISTEN status')
//       client.on('notification', data => {
//         console.log('-- notification fired, new sfid:\n', data.payload)
//         client.release()
//         console.log('-- client released, calling select query --')
//         retrieveCase(data.payload, cb)
//       })
//       .catch(err => {
//         client.release()
//         cb(err, null)
//       })
//     })
//   })
// }

