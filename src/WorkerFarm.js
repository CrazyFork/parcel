const {EventEmitter} = require('events');
const os = require('os');
const Farm = require('worker-farm/lib/farm');
const promisify = require('./utils/promisify');
const logger = require('./Logger');

let shared = null;

// 扩展 worker-farm 的 farm, 这个类如果要看懂估计要读下 worker-farm 的源码, 毕竟官方文档烂的一比, js 生态通病
class WorkerFarm extends Farm {
  /**
   *
   * @param {*} options
   *  maxConcurrentWorkers:  控制是否执行
   */
  constructor(options) {
    let opts = {
      maxConcurrentWorkers: getNumWorkers()
    };

    super(opts, require.resolve('./worker'));

    this.localWorker = this.promisifyWorker(require('./worker'));
    // Farm's method?
    // setup 应该是 'worker-farm/lib/farm' 这个类的内置方法, init, run 应该是会顺序掉 this 的 `init` 和 `run`方法
    this.remoteWorker = this.promisifyWorker(this.setup(['init', 'run']));

    this.started = false;
    this.warmWorkers = 0;
    this.init(options);
  }

  init(options) {
    this.localWorker.init(options);
    this.initRemoteWorkers(options);
  }

  promisifyWorker(worker) {
    let res = {};

    for (let key in worker) {
      // worker's main methods are all type of  (...args, cb(error, ...rest)), so turn it into promise
      res[key] = promisify(worker[key].bind(worker));
    }

    return res;
  }

  async initRemoteWorkers(options) {
    this.started = false;
    this.warmWorkers = 0;

    let promises = [];
    for (let i = 0; i < this.options.maxConcurrentWorkers; i++) {
      promises.push(this.remoteWorker.init(options));
    }

    await Promise.all(promises);
    if (this.options.maxConcurrentWorkers > 0) {
      this.started = true;
    }
  }

  /**
   * todo: receive 什么时候被调用的
   * @param {*} data
   *    event
   *    args
   *    type
   *    child
   */
  receive(data) {
    if (data.event) {
      this.emit(data.event, ...data.args);
    } else if (data.type === 'logger') {
      if (this.shouldUseRemoteWorkers()) {
        logger.handleMessage(data);
      }
    } else if (this.children[data.child]) {
      super.receive(data);
    }
  }

  // 判断是否用 remote worker 来处理任务, remote worker 由于使用的 spawn child process 所以起始开销比较大
  shouldUseRemoteWorkers() {
    return this.started && this.warmWorkers >= this.activeChildren;
  }

  async run(...args) {
    // Child process workers are slow to start (~600ms).
    // While we're waiting, just run on the main thread.
    // This significantly speeds up startup time.
    if (this.shouldUseRemoteWorkers()) {
      return this.remoteWorker.run(...args, false);
    } else {
      // Workers have started, but are not warmed up yet.
      // Send the job to a remote worker in the background,
      // but use the result from the local worker - it will be faster.
      if (this.started) {
        this.remoteWorker.run(...args, true).then(
          () => {
            this.warmWorkers++;
          },
          () => {
            // ignore error
          }
        );
      }

      return this.localWorker.run(...args, false);
    }
  }

  end() {
    // Force kill all children
    this.ending = true;
    for (let child in this.children) {
      this.stopChild(child);
    }

    this.ending = false;
    shared = null;
  }

  static getShared(options) {
    if (!shared) {
      shared = new WorkerFarm(options);
    } else {
      shared.init(options);
    }

    return shared;
  }
}

// bm: mixin EventEmitter
for (let key in EventEmitter.prototype) {
  WorkerFarm.prototype[key] = EventEmitter.prototype[key];
}

function getNumWorkers() {
  if (process.env.PARCEL_WORKERS) {
    return parseInt(process.env.PARCEL_WORKERS, 10);
  }

  let cores;
  try {
    cores = require('physical-cpu-count');
  } catch (err) {
    cores = os.cpus().length;
  }
  return cores || 1;
}

module.exports = WorkerFarm;
