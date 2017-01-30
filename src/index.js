
import http from 'http'
import Botkit from 'botkit'
import jsforce from 'jsforce'
import mongo from './lib/mongo-storage'
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

if (!config('SLACK_CLIENT_ID') || !config('SLACK_CLIENT_SECRET')) {
  console.log('Error: Specify Slack Client Id and Client Secret in environment')
  process.exit(1)
}

const controller = Botkit.slackbot({
  interactive_replies: true,
  storage: mongoStorage
}).configureSlackApp({
  clientId: config('SLACK_CLIENT_ID'),
  clientSecret: config('SLACK_CLIENT_SECRET'),
  redirectUri: 'https://slackmanage-internal-sandbox.herokuapp.com/oauth',
  scopes: ['bot', 'incoming-webhook', 'commands']
})

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
    res.send('Success! Sam has been added to your team')
  })

  webserver.get('/oauth2/auth', (req, res) => {
    res.redirect(oauth2.getAuthorizationUrl({ scope: 'api id web refresh_token' }))
  })
  const oauth2 = new jsforce.OAuth2({
    clientId: config('SF_CLIENT_ID'),
    clientSecret: config('SF_CLIENT_SECRET'),
    redirectUri: 'https://slackmanage-internal-sandbox.herokuapp.com/oauth2/authorize'
  })

  webserver.get('/oauth2/authorize', (req, res) => {
    const conn = new jsforce.Connection({ oauth2 })
    const code = req.param('code')
    conn.authorize(code, (err, userInfo) => {
      if (err) { return console.error(err) }
      console.log(`User ID: ${userInfo.id}`)
      console.log(`Org ID: ${userInfo.organizationId}`)

      let sfTokens = {
        id: userInfo.organizationId,
        bot: 'unassigned',
        tokens:
        {
          sfInstanceUrl: conn.instanceUrl,
          sfAccessToken: conn.accessToken,
          sfRefreshToken: conn.refreshToken
        }
      }

      controller.storage.sf.save(sfTokens)
      teams(userInfo.organizationId)
    })
    res.send('Successfully Authenticated with Service Cloud!')
  })

  webserver.post('/webhook', (req, res) => {
    console.log(' ** webhook request received **\n')
    try {
      let speech = 'empty speech'
      if (req.body) {
        console.log(' --> request passed')
        let requestBody = req.body
        if (requestBody.result) {
          speech = ''
          if (requestBody.result.fulfillment) {
            speech += requestBody.result.fulfillment.speech + ' '
          }
        }
      }
      console.log(' --> result: ', speech)
      return res.json({
        speech: speech,
        displayText: speech,
        source: 'slackmanage-internal-sandbox'
      })
    } catch (err) {
      console.error('ERROR: Cant process request - ', err)

      return res.status(400).json({
        status: {
          code: 400,
          errorType: err.message
        }
      })
    }
  })
})

/*************************************************************************************************/

const _bots = {}
const _convos = {}
function trackConvo (bot, convo) {
  _bots[bot.config.token] = bot
  _convos[bot.config.token] = convo
}

// simple function to plug up all the currently existing teams in the redis
function teams (orgId) {
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
            if (orgId && !teams[t].org) {
              teams[t].org = orgId
              controller.storage.sf.get(orgId, (err, sf) => {
                if (err) console.log(err)
                else {
                  console.log(sf)
                  teams[t].org.auth = sf.tokens
                  sf.bot = teams[t].bot
                }
              })
            } else {
              const convo = Conversation(controller, bot, teams[t].id)
              trackConvo(bot, convo)
              convo.getUserEmailArray(bot)
            }
          }
        })
      }
    }
  })
}

// quick greeting/create convo on new bot creation
controller.on('create_bot', (bot, config) => {
  console.log('** bot is being created **\n')
  if (_bots[bot.config.token]) { // do nothing
  } else {
    bot.startRTM(err => {
      if (!err) {
        if (_convos[bot.config.token]) {
          trackConvo(bot, _convos[bot.config.token])
          _convos[bot.config.token].getUserEmailArray(bot)
        } else {
          const convo = new Conversation(controller, bot, bot.team_id)
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

teams()

