
import apiaiService from 'apiai'
import util from 'util'

export default (config) => {
  if (!config.token) {
    throw new Error('Error: No api.ai token provided!')
  } if (!config.minimum_confidence) {
    config.minimum_confidence = 0.5 // raise this to .5 or .6 after training the nlp
  }

  var apiai = apiaiService(config.token)
  var middleware = {}

  middleware.receive = (bot, message, next) => {
    if (message.type === 'message' && message.text && message.user !== bot.identifyBot().id) {
      console.log(' --> middleware received: ', message.text)

      let session = bot.identifyBot().id + '_' + bot.identifyBot().team_id
      let request = apiai.textRequest(message.text, {sessionId: session})
      request.on('response', response => {
        console.log(' --> got a response!')
        message.intent = response.result.metadata.intentName
        message.entities = response.result.parameters
        message.fulfillment = response.result.fulfillment
        message.confidence = response.result.score
        message.nlpResponse = response
        next()
      })

      request.on('error', error => {
        next(error)
      })
      request.end()
    } else {
      next()
    }
  }

  middleware.hears = (tests, message) => {
    console.log('... middlware hearing ...')
    console.log(' [Tests]: ', util.inspect(tests), '\n [Message]: ', util.inspect(message.intent))
    for (var i = 0; i < tests.length; i++) {
      if (message.intent === tests[i] &&
        message.confidence >= config.minimum_confidence) {
        return true
      }
    }
    return false
  }
  return middleware
}

