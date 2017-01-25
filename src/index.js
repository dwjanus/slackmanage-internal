
import http from 'http'
import Botkit from 'botkit'
import mongo from 'botkit-storage-mongo'
import config from './lib/config.js'
import Conversation from './lib/conversation.js'

// Simple hack to ping server every 5min and keep app running
setInterval(() => {
  http.get('http://slackmanage-internal-sandbox.herokuapp.com')
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

const _bots = {}
function trackBot (bot) {
  _bots[bot.config.token] = bot
}

const _convos = {}
function trackConvo (bot, convo) {
  _convos[bot.config.token] = convo
  trackBot(bot)
}

controller.storage.teams.all((err, teams) => {
  console.log('** connecting teams **\n')
  if (err) {
    throw new Error(err)
  }
  for (const t in teams) {
    if (teams[t].bot) {
      const bot = controller.spawn(teams[t]).startRTM(err => {
        if (err) throw new Error('Error connecting bot to Slack:', err)
        else {
          const convo = new Conversation(controller, bot)
          trackConvo(bot, convo)
          convo.getUserEmailArray(bot)
        }
      })
    }
  }
})

// quick greeting/create convo on new bot creation
controller.on('create_bot', (bot, config) => {
  console.log('** bot is being created **\n')
  if (_bots[bot.config.token]) { // do nothing
  } else {
    bot.startRTM(err => {
      if (!err) {
        if (_convos[bot.config.token]) {
          trackBot(bot)
          _convos[bot.config.token].getUserEmailArray(bot)
        } else {
          const convo = new Conversation(controller, bot)
          trackConvo(bot, convo)
          convo.getUserEmailArray(bot)
        }
      }
      bot.startPrivateConversation({user: config.createdBy}, (err, convo) => {
        if (err) {
          console.log(err)
        } else {
          convo.say('Howdy! I am the bot that you just added to your team.')
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

controller.setupWebserver(port, (err, webserver) => {
  if (err) console.log(err)
  controller.createWebhookEndpoints(controller.webserver)
  controller.createOauthEndpoints(controller.webserver, (err, req, res) => {
    if (err) res.status(500).send(`ERROR: ${err}`)
    else res.redirect('https://slackmanage-internal-sandbox.herokuapp.com/success')
  })

  webserver.get('/', (req, res) => {
    res.send('<a href="https://slack.com/oauth/authorize?scope=incoming-webhook,' +
      'commands,bot&client_id=64177576980.133263707447"><img alt="Add to Slack" ' +
      'height="40" width="139" src="https://platform.slack-edge.com/img/add_to_slack.png" ' +
      'srcset="https://platform.slack-edge.com/img/add_to_slack.png 1x,' +
      'https://platform.slack-edge.com/img/add_to_slack@2x.png 2x" /></a>')
  })

  webserver.get('/success', (req, res) => {
    res.send('Success! Hal has been added to your team')
  })
})
