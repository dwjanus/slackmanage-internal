import _ from 'lodash'
import util from 'util'
import db from './db.js'
import config from './config.js'
import ApiAi from './middleware-apiai.js'

export default (controller, bot) => {
  const fullTeamList = []
  const fullChannelList = []
  const apiai = ApiAi({token: config('APIAI_DEV_TOKEN')})

  controller.middleware.receive.use(apiai.receive)

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
        ]
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
    if (user === 'Devin Janus' || 'Justin Jeffries') bot.reply(message, _.toString(util.inspect(fullChannelList)))
  })

  controller.hears('(^users$)', 'direct_message', (bot, message) => {
    let user = _.find(fullTeamList, { id: message.user }).fullName
    if (user === 'Devin Janus' || 'Justin Jeffries') bot.reply(message, _.toString(util.inspect(fullTeamList)))
  })

  controller.hears([undefined], ['direct_message'], apiai.hears, (bot, message) => {
    let nlpReply = {
      fallback: '~ NLP response Error ~',
      text: message.fulfillment.speech,
      color: '#0067B3',
      mrkdown_in: ['text', 'pretext']
    }

    bot.reply(message, nlpReply)
  })

  // ~ ~ * ~ ~ ~ * * ~ ~ ~ ~ * * * ~ ~ ~ ~ ~ * * * ~ ~ ~ ~ * * ~ ~ ~ * * ~ ~ ~ * * ~ ~ ~ * ~ ~ ~ * ~ ~ * ~ ~ //

  // Handler for case creation
  controller.hears('service request', ['direct_message'], apiai.hears, (bot, message) => {
    if (message.nlpResponse.result.action === 'createRequest') {
      console.log('--> Intent heard: Service Request')
      console.log('--> message looks like:\n' + util.inspect(message))
      console.log('--> nlp looks like:\n' + util.inspect(message.nlpResponse.result))
      let user = _.find(fullTeamList, { id: message.user }).fullName
      let email = _.find(fullTeamList, { id: message.user }).email
      // let user = 'Devin Janus' // change this once we know where the variable lives
      // let email = 'devin.janus@example.com' // same here as above
      let longSubject = message.entities[subject].value
      let subject = _.truncate(longSubject)
      if (longSubject.length <= 0) {
        console.log('- No subject found! -')
      } else {
        console.log(`- Subject found: ${longSubject} -`)
      }
      let description = `${longSubject}\n\nAutomated incident creation for: ${user} -- ${email} ~ sent from Slack via HAL 9000`
      db.createRequest(subject, user, email, description)
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
    }
  })

  // Handler for interractive message buttons
  controller.on('interactive_message_callback', (bot, message) => {
    console.log(`** interractive message callback ${message.callback_id} recieved **`)
  })

  return {
    getUserEmailArray (bot) {
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
  }
}
