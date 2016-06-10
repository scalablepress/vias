import _ from 'lodash';
import objectHash from 'object-hash';

class ViasPromise {
  constructor(model, method, data, shape, exec) {
    this.model = model;
    this.method = method;
    this.data = data;
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

  fulfill() {
    this.pending = true;

    this.started = true;
    this._exec((err, result, meta) => {
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
      this.listeners = [];
    });

    return this;
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

  exec(cb) {
    return this.fulfill().onFinish(cb);
  }
}

export default ViasPromise;
