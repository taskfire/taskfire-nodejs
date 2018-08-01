// import { asCallback } from 'promise-callbacks'
import request from 'request-promise-native'
import { withCallback } from './util'

import ProjectResources from './resources/projects'
import RunResources from './resources/runs'
import TaskResources from './resources/tasks'

const defaults = {
  url: 'https://api.taskfire.io',
  request: {
    json: true,
  },
}

class Client {
  constructor (apiToken, options) {
    if (!apiToken) {
      throw new Error('Missing required first paramater `apiToken`')
    }

    this.token = apiToken
    this.options = {
      ...defaults,
      ...options,
    }

    this.project = new ProjectResources(this)
    this.runs = new RunResources(this)
    this.tasks = new TaskResources(this)
  }

  async request (req, cb) {
    return withCallback(async () => {
      const query = req.query || {}
      if (this.options.projectId) {
        query.projectId = this.options.projectId
      }
      return request({
        ...this.options.request,
        ...req,
        baseUrl: this.options.url,
        qs: query,
        auth: {
          user: this.token,
          pass: '',
        },
      })
    }, cb)
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
