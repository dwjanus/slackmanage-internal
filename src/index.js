
import http from 'http'
import _ from 'lodash'
import util from 'util'
import Botkit from 'botkit'
import mongo from 'botkit-storage-mongo'
import config from './lib/config.js'
import db from './lib/db.js'

// Simple hack to ping server every 5min and keep app running
setInterval(() => {
  http.get('http://slackmanage-internal.herokuapp.com')
}, 300000)

const mongoStorage = mongo({mongoUri: config('MONGODB_URI')})
const port = process.env.PORT || process.env.port || config('PORT')

if (!port) {
  console.log('Error: Port not specified in environment')
  process.exit(1)
}

const controller = Botkit.slackbot({
  interactive_replies: true,
  storage: mongoStorage
}).configureSlackApp({
  clientId: config('SLACK_CLIENT_ID'),
  clientSecret: config('SLACK_CLIENT_SECRET'),
  scopes: ['bot', 'incoming-webhook', 'commands']
})

const fullTeamList = []
const fullChannelList = []

function getUserEmailArray (bot) {
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
}
const _bots = {}

function trackBot (bot) {
  _bots[bot.config.token] = bot
}

controller.storage.teams.all((err, teams) => {
  console.log('** connecting teams **\n')
  if (err) {
    throw new Error(err)
  }
  for (const t in teams) {
    if (teams[t].bot) {
      const bot = controller.spawn(teams[t]).startRTM(err => {
        if (err) throw new Error('Error connecting bot to Slack')
        else {
          trackBot(bot)
          getUserEmailArray(bot)
        }
      })
    }
  }
})

/*************************************************************************************************/

controller.setupWebserver(port, (err, webserver) => {
  if (err) console.log(err)
  controller.createWebhookEndpoints(controller.webserver)
  controller.createOauthEndpoints(controller.webserver, (err, req, res) => {
    if (err) res.status(500).send(`ERROR: ${err}`)
    else res.redirect('https://slackmanage-internal.herokuapp.com/success')
  })

  webserver.get('/', (req, res) => {
    res.send('<a href="https://slack.com/oauth/authorize?scope=incoming-webhook,' +
      'commands,bot&client_id=64177576980.131980542050"><img alt="Add to Slack" ' +
      'height="40" width="139" src="https://platform.slack-edge.com/img/add_to_slack.png" ' +
      'srcset="https://platform.slack-edge.com/img/add_to_slack.png 1x,' +
      'https://platform.slack-edge.com/img/add_to_slack@2x.png 2x" /></a>')
  })

  webserver.get('/success', (req, res) => {
    res.send('Success! Sam has been added to your team')
  })
})

// quick greeting/create convo on new bot creation
controller.on('create_bot', (bot, config) => {
  console.log('** bot is being created **\n')
  if (_bots[bot.config.token]) { // do nothing
  } else {
    bot.startRTM(err => {
      if (!err) {
        trackBot(bot)
        getUserEmailArray(bot)
      }
      bot.startPrivateConversation({user: config.createdBy}, (err, convo) => {
        if (err) {
          console.log(err)
        } else {
          convo.say('Howdy! I am the bot that has just joined your team.')
          convo.say('All you gotta do is send me messages now')
        }
      })
    })
  }
})

// Handle events related to the websocket connection to Slack
controller.on('rtm_open', bot => {
  console.log('** The RTM api just connected!')
})

controller.on('rtm_close', bot => {
  console.log('** The RTM api just closed')
  // may want to attempt to re-open
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
    text: 'Sam automates ticket creation for the Samanage Internal Service Desk.',
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
  if (user === 'Devin Janus' || 'Justin Jeffries') bot.reply(message, _.toString(util.inspect(fullChannelList)))
})

controller.hears('(^users$)', 'direct_message', (bot, message) => {
  let user = _.find(fullTeamList, { id: message.user }).fullName
  if (user === 'Devin Janus' || 'Justin Jeffries') bot.reply(message, _.toString(util.inspect(fullTeamList)))
})

// ~ ~ * ~ ~ ~ * * ~ ~ ~ ~ * * * ~ ~ ~ ~ ~ * * * ~ ~ ~ ~ * * ~ ~ ~ * * ~ ~ ~ * * ~ ~ ~ * ~ ~ ~ * ~ ~ * ~ ~ //

// Handler for case creation
controller.hears('(.*)', ['direct_message'], (bot, message) => {
  let user = _.find(fullTeamList, { id: message.user }).fullName
  let email = _.find(fullTeamList, { id: message.user }).email
  let subject = _.truncate(message.text)
  let description = `${message.text}\n\nAutomated incident creation for: ${user} -- ${email} ~ sent from Slack via HAL 9000`
  db.createCase(subject, user, email, description)
    .then(result => {
      let attachments = [
        {
          title: 'Ticket Submitted!',
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

