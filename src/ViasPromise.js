import objectHash from './objectHash';
import {pathValue, setValueByPath, clone} from './util';


// Synchronous state container for async data request

class ViasPromise {
  constructor(model, method, data, options, shape, exec) {
    this.model = model;
    // Method name
    this.method = method;
    // Data params to resolve this promise
    this.data = data;
    this.options = options;
    // Result shape function
    this.shape = shape;
    this._exec = exec;
    // Do not mark promise to be pending until it start fulfilling
    this.pending = false;
    this.fulfilled = false;
    this.rejected = false;
    this.callbacks = [];
    this.createdAt = new Date();
    if (method && data) {
      // Hash of this promise to easier comparing
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
      return cacheModel.fromCache(alias, result);
    } else {
      let populated = clone(result);
      for (let path of aliasPaths) {
        let key = pathValue(result, path);
        setValueByPath(populated, path, cacheModel.fromCache(alias, key));
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

  // Fulfil the data request
  fulfill(options = {}) {
    options = Object.assign({}, this.options, options);
    if (options.refresh) {
      options.expiry = 0;
    }
    if (this.key && this.promiseCache) {
      let cachedPromise = this.promiseCache[this.key];
      // Copy cached promise to this new promise
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

    // Do not fulfill promise marked executed
    if (this.executed) {
      return this;
    }

    this.pending = true;

    // Mark promise executed so request won't get fulfill again
    this.executed = true;
    if (this.key && this.promiseCache) {
      let cachedPromise = this.promiseCache[this.key];
      cachedPromise.executed = true;
    }
    this._exec(options, (err, result, meta) => {
      if (err) {
        this.reason = err;
        this.pending = this.fulfilled = false;
        this.rejected = true;
        return this._broadcast();
      }
      if (result) {
        this.value = result;
        this.meta = meta;
        this.pending = this.rejected = false;
        this.fulfilled = true;
        this._broadcast();
      } else if (options.sync) {
        // Synchronous fulfillment can be fulfill again in case document is not in the cache
        this.executed = false;
      }
    });

    return this;
  }

  // Re-fulfill promise
  refresh(options) {
    this.pending = false;
    this.rejected = false;
    this.fulfilled = false;
    this.executed = false;
    this.reason = null;
    this.value = null;
    this.meta = null;
    this.fulfill(Object.assign({refresh: true}, options));
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
