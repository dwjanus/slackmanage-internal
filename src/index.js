
import http from 'http'
import util from 'util'
import Botkit from 'botkit'
import db from './lib/db.js'
import config from './lib/config.js'

// Simple hack to ping server every 5min and keep app running
setInterval(() => {
  http.get('http://slackmanage-internal.herokuapp.com')
}, 300000)

async function runQuery (query, args) {
  try {
    let response = await db.query(query, args)
    let temp = db.query("LISTEN status")
    return response
  } catch (err) {
    console.log(err)
  }
}

const port = process.env.PORT || process.env.port || config('PORT')

if (!port) {
  console.log('Error: Specify port in environment')
  process.exit(1)
}

const controller = Botkit.slackbot({
  interactive_replies: true
})

controller.spawn({
  token: config('SLACK_TOKEN')
}).startRTM((err) => {
  if (err) throw new Error(err)
})

/*************************************************************************************************/

controller.setupWebserver(port, (err, webserver) => {
  if (err) console.log(err)
  controller.createWebhookEndpoints(controller.webserver)

  webserver.get('/', (req, res) => {
    res.send('Whuttr Yu Doin Hur??')
  })
})

/*************************************************************************************************/

controller.hears(['(^help$)'], ['direct_message', 'direct_mention'], (bot, message) => {
  let attachments = [
    {
      title: 'Usage',
      color: '#0067B3',
      text: 'Simply direct mention (@hal) in any channel you have invited ' +
            'the bot to, or send a direct message to: HAL 9000. Any message ' +
            'sent to Hal will automatically be submitted as an internal ticket ' +
            'with the entire message body as the case subject.',
      fields: [
        {
          title: 'Example', // maybe make this a gif or jpg?
          value: 'User: @hal: I need help with my keyboard\n' +
                 'HAL 9000: Your ticket for: \"I need help with my keyboard\" ' +
                 'has been submitted!',
          short: false
        }
      ],
      mrkdown_in: ['text', 'pretext']
    }
  ]

  let replyWithAttachments = {
    pretext: 'Samanage bot help',
    text: 'Samanage bot automates ticket creation for the Samanage Internal Service Desk.',
    attachments,
    mrkdown_in: ['text', 'pretext']
  }

  bot.reply(message, replyWithAttachments)
})

controller.hears('^stop', 'direct_message', (bot, message) => {
  bot.reply(message, 'Goodbye')
  bot.rtm.close()
})

// ~ ~ * ~ ~ ~ * * ~ ~ ~ ~ * * * ~ ~ ~ ~ ~ * * * ~ ~ ~ ~ * * ~ ~ ~ * * ~ ~ ~ * * ~ ~ ~ * ~ ~ ~ * ~ ~ * ~ ~ //

// Handler for case creation
controller.hears('(.*)', ['direct_message', 'direct_mention'], (bot, message) => {
  bot.api.users.info({user: message.user}, (err, res) => {
    if (err) console.log(err)
    let subject = message.text
    let user = res.user.profile.real_name
    let recordtypeid = '01239000000EB4NAAW' // may need this later?
    let description = `Automated incident creation via HAL9000 slackbot for: ${res.user.profile.real_name} ~ Slack Id: ${message.user}`
    let createQuery = 'INSERT INTO salesforcesandbox.case(subject, creatorname, samanageesd__creatorname__c, samanageesd__requestername__c, description, ' +
      'recordtypeid, samanageesd__recordtype__c, origin) values($1, $2, $3, $4, $5, $6, $7, $8);'
    let args = [subject, user, user, user, description, recordtypeid, 'Incident', 'Slack']
    let responseQuery = `SELECT * FROM salesforcesandbox.case WHERE subject = '${subject}'`
    runQuery(createQuery, args)
    .then(() => {
      runQuery(responseQuery, [])
      .then(res2 => {
        console.log(util.inspect(res2.rows))
        bot.reply(message, {
          title: `Success! Your ticket has been created`,
          title_link: `https://cs3.salesforce.com./apex/SamanageESD__Incident?id=${res2.rows[0].sfid}`,
          text: `Subject: ${subject}`
        })
      })
    })
  })
})

// Handler for interractive message buttons
controller.on('interactive_message_callback', (bot, message) => {
  console.log(`** interractive message callback ${message.callback_id} recieved **`)
})

// Handle events related to the websocket connection to Slack
controller.on('rtm_open', bot => {
  console.log('** The RTM api just connected!')
})

controller.on('rtm_close', bot => {
  console.log('** The RTM api just closed')
  // may want to attempt to re-open
})
