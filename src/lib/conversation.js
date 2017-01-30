import _ from 'lodash'
import util from 'util'
import Salesforce from './salesforce.js'
import config from './config.js'
import ApiAi from './middleware-apiai.js'

Array.prototype.addCommentButtons = function (comments) {
  for (let c = 0; c < comments.length; c++) {
    for (let i = 0; i < this.length; i++) {
      if (this[i].pretext === ('Case: ' + comments[c].case_number)) {
        this[i]['fallback'] = 'Comments'
        this[i]['callback_id'] = `commentsBTN_${comments[c].id}_${comments[c].case_number}`
        this[i]['attachment_type'] = 'default'
        this[i]['actions'] = [{
          name: 'View',
          text: 'View Comments',
          type: 'button'
        }]
      }
    }
  }
}

// const setAttachmentColorForCase = function (Case) {
//   let color = '#18a6fb' // new
//   if (Case.Status === 'Working') color = '#f37ef4'
//   if (Case.Status === 'Awaiting Input') color = '#f7a084'
//   if (Case.Status === 'On Hold') color = '#829dba'
//   if (Case.Status === 'Escalated') color = '#6284f4'
//   if (Case.Status === 'Closed') color = '#a7b8d1'
//   if (Case.Status === 'Approved') color = '#33a95d'
//   if (Case.Status === 'Declined') color = '#a90101'
//   if (Case.Status === 'Resolved') color = '#31b95d'
//   return color
// }

export default (controller, bot, teamId) => {
  const fullTeamList = []
  const fullChannelList = []
  let salesforce
  connectToSF()

  function connectToSF () {
    controller.storage.teams.get(teamId, (err, team) => {
      if (err) console.log(err)
      let salesforceWrapper = Salesforce(team.org.tokens.sfInstanceUrl, team.org.tokens.sfAccessToken, team.org.sfRefreshToken)
      salesforce = salesforceWrapper.salesforce

      if (salesforceWrapper.refresh) {
        console.log('** refresh token passed with constructor ... updating storage now **')
        team.org.tokens.sfAccessToken = salesforceWrapper.refresh
        controller.storage.sfAuth.save(team.orgs)
        controller.storage.teams.save(team)
        console.log(' --> updated sfAuth stored for future connection\n')
      }
    })
  }

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
      text: message.fulfillment.displayText,
      color: '#0067B3',
      mrkdown_in: ['text', 'pretext']
    }

    bot.reply(message, nlpReply)
  })

  // ~ ~ * ~ ~ ~ * * ~ ~ ~ ~ * * * ~ ~ ~ ~ ~ * * * ~ ~ ~ ~ * * ~ ~ ~ * * ~ ~ ~ * * ~ ~ ~ * ~ ~ ~ * ~ ~ * ~ ~ //

  // Handler for case creation
  controller.hears(['service request'], ['direct_message'], apiai.hears, (bot, message) => {
    if (message.nlpResponse.result.action === 'createRequest') {
      console.log('--> Intent heard: Service Request')
      console.log('--> message looks like:\n' + util.inspect(message))
      console.log('--> nlp looks like:\n' + util.inspect(message.nlpResponse.result))
      let user = _.find(fullTeamList, { id: message.user }).fullName
      let email = _.find(fullTeamList, { id: message.user }).email
      let subject = _.truncate(message.text)
      let description = `${message.text}\n\nAutomated incident creation for: ${user} -- ${email} ~ sent from Slack via HAL 9000`
      salesforce.createRequest(subject, user, email, description)
        .then(result => {
          let attachments = [
            {
              title: 'Service Request Submitted:',
              title_link: 'https://samanagesupport.force.com/Samanage/s/requests',
              text: `${subject}`,
              color: '#0067B3'
            }
          ]
          return bot.reply(message, {text: message.fulfillment.displayText, attachments})
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
