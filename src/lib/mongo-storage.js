import monk from 'monk'

/**
 * custom version of botkit-storage-mongo - MongoDB driver for Botkit
 *
 * @param  {Object} config Must contain a mongoUri property
 * @return {Object} A storage object conforming to the Botkit storage interface
 */
module.exports = (config) => {
  if (!config || !config.mongoUri) {
    throw new Error('Need to provide mongo address.')
  }

  const db = monk(config.mongoUri)
  const storage = {};

  ['teams', 'channels', 'users', 'sf'].forEach(zone => {
    storage[zone] = getStorage(db, zone)
  })

  return storage
}

/**
 * Creates a storage object for a given "zone", i.e, teams, channels, or users
 *
 * @param {Object} db A reference to the MongoDB instance
 * @param {String} zone The table to query in the database
 * @returns {{get: get, save: save, all: all}}
 */
function getStorage (db, zone) {
  const table = db.get(zone)

  return {
    get: function (id, cb) {
      table.findOne({id: id}, cb)
    },
    save: function (data, cb) {
      table.findAndModify({
        id: data.id
      }, data, {
        upsert: true,
        new: true
      }, cb)
    },
    all: function (cb) {
      table.find({}, cb)
    }
  }
}
