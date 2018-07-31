import { asCallback, promisify } from 'promise-callbacks'
import EventEmitter from 'events'
import WebSocket from 'ws'
import { withCallback } from './util'

import Request from './request'
// import Project from './project'
import QueueResources from './resources/queues'
import TaskResources from './resources/tasks'

const defaults = {
  url: 'wss://api.queue.ws',
}

class Client extends EventEmitter {
  constructor (apiToken, options) {
    super()

    if (!apiToken) {
      throw new Error('Missing required first paramater `apiToken`')
    }

    this.token = apiToken
    this.options = {
      ...defaults,
      ...options,
    }

    this.ws = new WebSocket(`${this.options.url}/${apiToken}`)
    this.ws.on('error', (...err) => this.emit('error', ...err))

    // this.project = new Project(this)
    this.queues = new QueueResources(this)
    this.tasks = new TaskResources(this)

    this.requestCounter = 0
    this.requests = new Map()

    this._sendPromise = promisify.method(this.ws, 'send')

    this.ready = new Promise((resolve) => {
      this.ws.on('open', resolve)
      this.ws.on('message', msg => this._receive(msg))
      return true
    }).then(() => {
      this.emit('open')
    })
  }

  async request (req, cb) {
    // Wait for connection to be ready
    await this.ready

    this.requestCounter += 1
    const reqData = ({
      ...req,
      requestId: this.requestCounter,
    })

    // Add the request, so we can respond later
    const request = new Request(reqData)
    this.requests.set(this.requestCounter, request)

    this._send(reqData)

    if (cb) asCallback(request.promise, cb)
    return request.promise
  }

  async close (cb) {
    return withCallback(() => {
      this.ws.close(1000)
      return new Promise((resolve) => {
        this.ws.once('close', resolve)
      })
    }, cb)
  }

  async _send (obj) {
    let json
    try {
      json = JSON.stringify(obj)
    } catch (e) {
      throw new Error(`Client: Cannot convert request to JSON due to: ${e.message}`)
    }
    this._log('Send', obj)
    return this._sendPromise(json)
  }

  _receive (json) {
    const obj = JSON.parse(json)
    this._log('Receive', obj)

    const {
      status, requestId, type,
    } = obj

    if (type === 'RESPONSE') {
      // If for some reason that request does not exist - send error
      const req = this.requests.get(requestId)
      if (!req) this.emit('error', new Error('Invalid request ID received'))

      // Remove the request once received
      this.requests.delete(requestId)

      // Error status codes
      if (status >= 400 && status <= 599) {
        req.reject(obj)
      } else {
        // Otherwise, resolve the request
        req.resolve(obj)
      }
    } else if (type === 'WORK') {
      this.queues._processWork(obj)
    } else {
      this.emit('error', new Error('Unexpected message type received from server'))
    }
  }

  _log (event, ...params) {
    if (this.options.debug) {
      const stringy = params.map(param => JSON.stringify(param))
      // eslint-disable-next-line no-console
      console.log(event, ...stringy)
    }
  }
}

export default Client
