
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
  console.log('Error: Port not specified in environment')
  process.exit(1)
}

const controller = Botkit.slackbot({
  interactive_replies: true
})

const fullTeamList = []
const fullChannelList = []

controller.spawn({
  token: config('SLACK_TOKEN')
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
      text: 'Simply direct message Hal 9000 to submit your request. Any message ' +
            'sent to Hal will automatically be created as an internal support ticket ' +
            'on your behalf, with the [entire] message body as the subject.',
      fields: [
        {
          title: 'Example',
          value: 'User: I need help with my keyboard\n' +
                 'HAL 9000: Service Request Submitted:\nI need help with my keyboard',
          short: false
        }
      ],
      mrkdown_in: ['text', 'pretext']
    }
  ]

  let replyWithAttachments = {
    pretext: 'Samanage bot help',
    text: 'Hal 9000 automates ticket creation for the Samanage Internal Service Desk.',
    attachments,
    mrkdown_in: ['text', 'pretext']
  }

  bot.reply(message, replyWithAttachments)
})

controller.hears('^stop', 'direct_message', (bot, message) => {
  bot.reply(message, 'Goodbye')
  bot.rtm.close()
})

controller.hears('(^channels$)', 'direct_message', (bot, message) => {
  let user = _.find(fullTeamList, { id: message.user }).fullName
  if (user === 'Devin Janus') bot.reply(message, _.toString(util.inspect(fullChannelList)))
})

controller.hears('(^users$)', 'direct_message', (bot, message) => {
  let user = _.find(fullTeamList, { id: message.user }).fullName
  if (user === 'Devin Janus') bot.reply(message, _.toString(util.inspect(fullTeamList)))
})

// ~ ~ * ~ ~ ~ * * ~ ~ ~ ~ * * * ~ ~ ~ ~ ~ * * * ~ ~ ~ ~ * * ~ ~ ~ * * ~ ~ ~ * * ~ ~ ~ * ~ ~ ~ * ~ ~ * ~ ~ //

// Handler for case creation
controller.hears('(.*)', ['direct_message'], (bot, message) => {
  let user = _.find(fullTeamList, { id: message.user }).fullName
  let email = _.find(fullTeamList, { id: message.user }).email
  let subject = message.text
  let description = `Automated incident creation for: ${user} -- ${email} ~ sent from Slack via HAL 9000`
  db.createCase(subject, user, email, description)
    .then(result => {
      let attachments = [
        {
          title: 'Service Request Submitted:',
          title_link: 'https://samanagesupport.force.com/Samanage/s/requests',
          text: `${subject}`,
          color: '#0067B3'
        }
      ]
      return bot.reply(message, {text: 'Success!', attachments})
    })
  .catch(err => {
    console.log(err)
    return bot.reply(message, {text: err})
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

