
import util from 'util'
import pg from 'pg'
import Botkit from 'botkit'
import config from './config/config.js'

let client
pg.defaults.ssl = true
pg.connect(config('DATABASE_URL'), (err, res) => {
  if (err) throw err
  console.log('** Connected to postgres! Getting schemas...')
  client = res
  client
    .query('SELECT table_schema, table_name FROM information_schema.tables;')
    .on('row', (row) => {
      console.log(util.inspect(row))
    })
})

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

controller.hears(['(^help$)'], ['direct_message', 'direct_mention'], (bot, message) => {
  let attachments = [
    {
      title: 'Usage',
      color: '#0067B3',
      text: 'Simply direct mention (@samanage)\n' +
            'in any channel you have invited the bot to, or send a direct message\n' +
            'to "Samanage for Service Cloud" to begin.\n\n',
      fields: [
        {
          title: 'Example', // maybe make this a gif or jpg?
          value: 'Jamie: @samanage: hello\n' +
                 'Samanage bot: H e l l o  Jamie !\n' +
                 'Jamie: @samanage: I am having trouble processing a new hire\n' +
                 'Samanage bot: I have made a ticket for you\n',
          short: false
        }
      ],
      mrkdown_in: ['text', 'pretext']
    }
  ]

  let replyWithAttachments = {
    pretext: 'Samanage bot help',
    text: 'Samanage bot automates service through the Samanage Enterprise Service Desk on Service Cloud.',
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
controller.hears(('*'), ['direct_message', 'direct_mention'], (bot, message) => {
  bot.api.users.info({user: message.user}, (err, res) => {
    if (err) console.log(err)
    let subject = message.text
    let creator = res.user.profile.real_name
    let description = `${res.user.profile.real_name} ~ ${message.user}`

    client
      .query('INSERT INTO case(subject, creatorname, description, recordtypeid) values($1, $2, $3, $4)',
        [subject, creator, description, '01241000000IWNUAA4'])
      .on('end', (result) => {
        console.log(util.inspect(result))
      })

    bot.say('Hello I hear you!')
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
