import _ from 'lodash';
import objectHash from 'object-hash';

class ViasPromise {
  constructor(model, method, data, exec) {
    this.model = model;
    this.method = method;
    this.data = data;
    this.exec = exec;
    this.pending = false;
    this.fulfilled = false;
    this.rejected = false;
    this.callbacks = [];
    this.createdAt = new Date();
  }

  cacheModel() {
    return this.model;
  }

  populate() {
    if (!this.value || !this.cacheModel()) {
      return null;
    }
    let {alias, key, keys, result} = this.value;
    if (key) {
      return this.cacheModel().getFromCache(alias, key);
    }

    if (keys) {
      let populated = {};
      for (let key of keys) {
        populated[key] = this.cacheModel().getFromCache(alias, key);
      }
      return populated;
    }

    if (result) {
      return _.map(result, key => this.cacheModel().getFromCache(alias, key));
    }
  }

  _complyAttr(viasPromise) {
    this.pending = viasPromise.pending;
    this.fulfilled = viasPromise.fulfilled;
    this.rejected = viasPromise.rejected;
    this.value = viasPromise.value;
    this.reason = viasPromise.reason;
  }

  comply(viasPromise) {
    this._complyAttr(viasPromise);
    viasPromise.onFinish(() => {
      this._complyAttr(viasPromise);
      this._broadcast();
    });
  }

  storedPromise(groupId, promiseId) {
    if (groupId && promiseId) {
      let storedPromise = this.model.getPromise(groupId, promiseId);
      if (storedPromise && this.equals(storedPromise)) {
        return storedPromise;
      }
    }
    return null;
  }


  fulfill(groupId, promiseId) {
    this.pending = true;

    let storedPromise = this.storedPromise(groupId, promiseId);
    if (storedPromise) {
      this.comply(storedPromise);
    } else {
      if (groupId && promiseId) {
        this.model.storePromise(groupId, promiseId, this);
      }
      this.promise = new Promise(this.exec);
      this.promise.then((result) => {
        this.value = result;
        this.pending = this.rejected = false;
        this.fulfilled = true;
        this._broadcast();
        this.listeners = [];
      }).catch((err) => {
        this.reason = err;
        this.pending = this.fulfilled = false;
        this.rejected = true;
        this._broadcast();
      });
    }
    return this;
  }

  equals(vp) {
    return vp instanceof ViasPromise && this.model.name === vp.model.name && this.method === vp.method && objectHash(this.data) === objectHash(vp.data);
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
