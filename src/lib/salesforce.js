
// import util from 'util'
// import _ from 'lodash'
import jsforce from 'jsforce'
import config from './config.js'

// const createSearchString = (parameterHash) => {
//   const keyReduction = _.keys(parameterHash)
//   const keysToString = _.join(keyReduction, ', ')
//   return keysToString
// }

const recordtypeid = '01239000000EB4NAAW'

export default (instanceUrl, accessToken, refreshToken) => {
  console.log(`** Starting up salesforce.js now **\n--> instanceUrl: ${instanceUrl}\n
    --> accessToken: ${accessToken}\n--> refreshToken: ${refreshToken}`)

  // ************************************** //
  // Establish connection to Salesforce API //
  // ************************************** //

  if ((instanceUrl || accessToken || refreshToken) === undefined) {
    let err = '✋  Dowhatnow? An invalid Salesforce auth was provided'
    console.log(err)
  } else {
    let newToken
    const conn = new jsforce.Connection({
      oauth2: {
        clientId: config('SF_CLIENT_ID'),
        clientSecret: config('SF_CLIENT_SECRET'),
        redirectUri: 'https://slackmanage-internal-sandbox.herokuapp.com/oauth2/authorize'
      },
      instanceUrl,
      accessToken,
      refreshToken
    })

    conn.on('refresh', (accessToken, res) => {
      newToken = accessToken
    })

    const sf = retrieveSfObj(conn)
    console.log(`** connected to sf instance: ${conn.instanceUrl}\n`)
    return ({salesforce: sf, refresh: newToken})
  }
}

function retrieveSfObj (conn) {
  return {
    createRequest (subject, requester, email, description, callback) {
      let request
      let user

      this.getUserIdFromName(requester, (err, id) => {
        if (err) console.log(err)
        else user = id
        conn.sobject('Case').create({
          Subject: subject,
          SamanageESD__CreatorName__c: requester,
          SamanageESD__RequesterName__c: requester,
          SamanageESD__RequesterUser__c: user,
          Description: description,
          RecordTypeId: recordtypeid,
          SamanageESD__RecordType__c: 'Incident',
          Origin: 'Slack'
        }, (err, ret) => {
          if (err || !ret.success) return console.error(err)
          console.log(`Created records id: ${ret.id}`)
          request = ret
          request['title_link'] = `${conn.instanceUrl}/${ret.id}`
          conn.sobject('Case').retrieve(ret.id, (err, res) => {
            if (err) console.log(err)
            request['CaseNumber'] = res.CaseNumber
            return callback(null, request)
          })
        })
      })
    },

    getUserIdFromName (name, callback) {
      conn.query(`SELECT Id FROM User WHERE FullName__c = '${name}'`, (err, result) => {
        if (err) return console.error(err)
        return callback(null, result.records[0].Id)
      })
    }
  }
}
