class PromiseQueue {
  /**
   *
   * @param {func} callback, jobs 的回调函数, will be called in form of callback(job, ...args),
   *  should return a promise
   */
  constructor(callback) {
    this.process = callback; // the actuall job executor
    this.queue = [];  // job queue, with [job, args] type
    this.processing = new Set(); // jobs been processing
    this.processed = new Set(); // jobs has been processed
    this.runPromise = null; // the overall job queue been resolved or not
    this.resolve = null;
    this.reject = null;
  }

  add(job, ...args) {
    if (this.processing.has(job)) {
      return;
    }

    if (this.runPromise) {
      this._runJob(job, args);
    } else {
      this.queue.push([job, args]);
    }

    this.processing.add(job);
  }

  // result: Promise<processed: Set>
  run() {
    if (this.runPromise) {
      return this.runPromise;
    }

    const runPromise = new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });

    this.runPromise = runPromise;
    this._next();

    return runPromise;
  }

  async _runJob(job, args) {
    try {
      await this.process(job, ...args);
      this.processing.delete(job);
      this.processed.add(job);
      this._next();
    } catch (err) {
      this.queue.push([job, args]);
      this.reject(err);
      this._reset();
    }
  }

  _next() {
    if (!this.runPromise) {
      return;
    }

    if (this.queue.length > 0) {
      while (this.queue.length > 0) { // :bm, 要注意这一块的执行逻辑不是线性的, 是递归向下的, 逻辑可以说时很诡异的了
        this._runJob(...this.queue.shift()); // :bm, 这边执行完的逻辑好诡异呀, _reset 又会 调用 _next
      }
    } else if (this.processing.size === 0) {
      this.resolve(this.processed);
      this._reset();
    }
  }

  _reset() {
    this.processed = new Set();
    this.runPromise = null;
    this.resolve = null;
    this.reject = null;
  }
}

module.exports = PromiseQueue;
