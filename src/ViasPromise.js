import _ from 'lodash';
import objectHash from './objectHash';

class ViasPromise {
  constructor(model, method, data, options, shape, exec) {
    this.model = model;
    this.method = method;
    this.data = data;
    this.options = options;
    this.shape = shape;
    this._exec = exec;
    this.pending = false;
    this.fulfilled = false;
    this.rejected = false;
    this.callbacks = [];
    this.createdAt = new Date();
    if (method && data) {
      this.id = `${this.model.name}_${this.method}_${objectHash(this.data)}`;
    }
  }

  cacheModel() {
    return this.model;
  }

  // Populate actual up to date result using alias(es) stored
  populate() {
    let cacheModel = this.cacheModel();
    if (!this.value || !this.cacheModel()) {
      return null;
    }
    let {alias, result} = this.value;
    if (!alias) {
      return result;
    }

    let aliasPaths = this.shape(result);
    if (!aliasPaths) {
      return cacheModel.getFromCache(alias, result);
    } else {
      let populated = _.cloneDeep(result);
      for (let path of aliasPaths) {
        let key = _.get(result, path);
        _.set(populated, path, cacheModel.getFromCache(alias, key));
      }
      return populated;
    }
  }

  setKey(key) {
    this.key = key;
    return this;
  }

  setPromiseCache(cache) {
    this.promiseCache = cache;
    return this;
  }

  fulfill(options = {}) {
    options = _.merge({}, this.options, options);
    if (options.refresh) {
      options.expiry = 0;
    }
    if (this.key && this.promiseCache) {
      let cachedPromise = this.promiseCache[this.key];
      if (!options.refresh && cachedPromise && cachedPromise.id === this.id) {
        this.pending = cachedPromise.pending;
        this.rejected = cachedPromise.rejected;
        this.fulfilled = cachedPromise.fulfilled;
        this.executed = cachedPromise.executed;
        this.reason = cachedPromise.reason;
        this.value = cachedPromise.value;
        this.meta = cachedPromise.meta;
      } else {
        this.promiseCache[this.key] = this;
      }
    }

    if (this.executed) {
      return this;
    }

    this.pending = true;

    if (!options.sync) {
      this.executed = true;
      if (this.key && this.promiseCache) {
        let cachedPromise = this.promiseCache[this.key];
        cachedPromise.executed = true;
      }
    }

    this._exec(options, (err, result, meta) => {
      this.executed = true;
      if (err) {
        this.reason = err;
        this.pending = this.fulfilled = false;
        this.rejected = true;
        return this._broadcast();
      }
      this.value = result;
      this.meta = meta;
      this.pending = this.rejected = false;
      this.fulfilled = true;
      this._broadcast();
    });

    return this;
  }

  refresh(options) {
    this.fulfill(_.extend({refresh: true}, options));
  }

  _broadcast() {
    if (this.pending) {
      return;
    }
    for (let callback of this.callbacks) {
      if (this.reason) {
        callback(this.reason);
      } else {
        callback(null, this.populate());
      }
    }
    this.callbacks = [];
  }

  onFinish(callback) {
    if (this.pending) {
      this.callbacks.push(callback);
    } else if (this.fulfilled) {
      callback(null, this.populate());
    } else if (this.rejected) {
      callback(this.reason);
    }
    return this;
  }
}

export default ViasPromise;
