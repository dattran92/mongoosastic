'use strict'

const mongoose = require('mongoose')
const async = require('async')
const config = require('./config')
const mongoosastic = require('../lib/mongoosastic')

const Schema = mongoose.Schema

const BookSchema = new Schema({
  title: {
    type: String,
    required: true
  }
})

BookSchema.plugin(mongoosastic)

let saveCounter = 0
BookSchema.pre('save', function (next) {
  // Count save
  ++saveCounter
  next()
})

const Book = mongoose.model('Book', BookSchema)

describe('Synchronize', () => {
  let books = null

  const clearData = (cb) => {
    config.deleteIndexIfExists(['books'], () => {
      mongoose.connect(config.mongoUrl, () => {
        const client = mongoose.connections[0].db
        client.collection('books', (err, _books) => {
          books = _books
          Book.remove(cb)
        })
      })
    })
  }

  after(done => {
    Book.esClient.close()
    mongoose.disconnect()
    done()
  })

  describe('an existing collection with invalid field values', () => {
    before(done => {
      clearData(() => {
        async.forEach(config.bookTitlesArray(), (title, cb) => {
          books.insert({
            title: title
          }, cb)
        }, () => {
          books.insert({
          }, done)
        })
      })
    })

    it('should index all but one document', done => {
      saveCounter = 0
      const stream = Book.synchronize()
      let count = 0
      let errorCount = 0
      stream.on('data', () => {
        count++
      })
      stream.on('error', () => {
        errorCount += 1
      })
      stream.on('close', () => {
        count.should.eql(53)
        saveCounter.should.eql(count)

        setTimeout(() => {
          Book.search({
            query_string: {
              query: 'American'
            }
          }, (err, results) => {
            results.hits.total.should.eql(2)
            errorCount.should.eql(1)
            done()
          })
        }, config.INDEXING_TIMEOUT)
      })
    })
  })

  describe('an existing collection', () => {
    before(done => {
      clearData(() => {
        async.forEach(config.bookTitlesArray(), (title, cb) => {
          books.insert({
            title: title
          }, cb)
        }, done)
      })
    })

    it('should index all existing objects', done => {
      saveCounter = 0
      const stream = Book.synchronize()
      let count = 0
      // const stream = Book.synchronize({}, {saveOnSynchronize: true}), // default behaviour

      stream.on('data', () => {
        count++
      })

      stream.on('close', () => {
        count.should.eql(53)
        saveCounter.should.eql(count)

        setTimeout(() => {
          Book.search({
            query_string: {
              query: 'American'
            }
          }, (err, results) => {
            results.hits.total.should.eql(2)
            done()
          })
        }, config.INDEXING_TIMEOUT)
      })
    })

    it('should index all existing objects without saving them in MongoDB', done => {
      saveCounter = 0
      const stream = Book.synchronize({}, {saveOnSynchronize: false})
      let count = 0

      stream.on('data', (err, doc) => {
        if (doc._id) count++
      })

      stream.on('close', () => {
        count.should.eql(53)
        saveCounter.should.eql(0)

        setTimeout(() => {
          Book.search({
            query_string: {
              query: 'American'
            }
          }, (err, results) => {
            results.hits.total.should.eql(2)
            done()
          })
        }, config.INDEXING_TIMEOUT)
      })
    })
  })
})
