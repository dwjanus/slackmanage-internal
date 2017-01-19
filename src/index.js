
import http from 'http'
import _ from 'lodash'
import util from 'util'
import Botkit from 'botkit'
import config from './lib/config.js'
import db from './lib/db.js'

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
  interactive_replies: true,
  debug: false,
  logLevel: 5
})

const fullTeamList = []
const fullChannelList = []

controller.spawn({
  token: config('SLACK_TOKEN'),
  send_via_rtm: true
}).startRTM((err, bot) => {
  if (err) throw new Error(err)

  // @ https://api.slack.com/methods/users.list
  bot.api.users.list({}, (err, response) => {
    if (err) console.log(err)
    if (response.hasOwnProperty('members') && response.ok) {
      var total = response.members.length
      for (var i = 0; i < total; i++) {
        var member = response.members[i]
        fullTeamList.push({id: member.id, fullName: member.real_name, name: member.name, email: member.profile.email})
      }
    }
  })

  // @ https://api.slack.com/methods/channels.list
  bot.api.channels.list({}, (err, response) => {
    if (err) console.log(err)
    if (response.hasOwnProperty('channels') && response.ok) {
      var total = response.channels.length
      for (var i = 0; i < total; i++) {
        var channel = response.channels[i]
        fullChannelList.push({id: channel.id, name: channel.name})
      }
    }
  })
})

db.globalConnect()
.then(sco => {
  console.log('Listener is awaiting closed notification...')
  sco.client.on('notification', data => {
    console.log('Received closed notification:', util.inspect(data.payload))
    return data.payload
  })
  return sco.none('LISTEN closed')
})
.catch(error => {
  console.log('Error:', error)
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

controller.hears('(^hello$)', 'direct_message', (bot, message) => {
  let userTest = _.find(fullTeamList, { id: message.user }).fullName
  console.log('User Test: ' + util.inspect(userTest))
  bot.reply(message, 'Hello')
})

controller.hears('(^channels$)', 'direct_message', (bot, message) => {
  bot.reply(message, _.toString(util.inspect(fullChannelList)))
})

controller.hears('(^users$)', 'direct_message', (bot, message) => {
  bot.reply(message, _.toString(util.inspect(fullTeamList)))
})

// ~ ~ * ~ ~ ~ * * ~ ~ ~ ~ * * * ~ ~ ~ ~ ~ * * * ~ ~ ~ ~ * * ~ ~ ~ * * ~ ~ ~ * * ~ ~ ~ * ~ ~ ~ * ~ ~ * ~ ~ //

// Handler for case creation
controller.hears('(.*)', ['direct_message'], (bot, message) => {
  let user = _.find(fullTeamList, { id: message.user }).fullName
  let email = _.find(fullTeamList, { id: message.user }).email
  let subject = message.text
  let description = `Automated incident creation for: ${user} ~ sent from Slack via HAL 9000`
  db.createCase(subject, user, email, description)
    .then(result => {
      console.log(`~ 8. finished waiting for createCase, result:\n${util.inspect(result)}`)
      let response = {
        text: `Success!`,
        attachments: [
          {
            title: `Case: ${result.casenumber}`,
            title_link: `https://cs60.salesforce.com./apex/SamanageESD__Incident?id=${result.sfid}`,
            text: `${result.subject}`,
            color: '#0067B3'
          }
        ]
      }
      // here we would queue the listener for the status change of the case with (sfid)
      return bot.reply(message, response)
    })
  .catch(err => {
    console.log(err)
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

