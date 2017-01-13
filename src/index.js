
import pg from 'pg'
import http from 'http'
import util from 'util'
import Botkit from 'botkit'
import db from './lib/db.js'
import config from './lib/config.js'

// Simple hack to ping server every 5min and keep app running
setInterval(() => {
  http.get('http://slackmanage-internal.herokuapp.com')
}, 300000)

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
    let description = `Automated incident creation via HAL9000 slackbot for: ${res.user.profile.real_name} ~ Slack Id: ${message.user}`

    db.createCase(subject, user, description, (err, res) => {
      if (err) console.log(err)
      console.log('--> Create Case response: ', util.inspect(res))
      db.retrieveCase(res, (err, result) => {
        if (err) console.log(err)
        console.log('App-level Retrieval result: ' + util.inspect(result))
        bot.reply(message, {
          text: `Success!`,
          attachments: [
            {
              title: `Case: ${result.casenumber}`,
              title_link: `https://cs60.salesforce.com./apex/SamanageESD__Incident?id=${result.sfid}`,
              text: `${result.subject}`,
              color: '#0067B3'
            }
          ]
        })
        console.log('~ create case finished ~')
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
