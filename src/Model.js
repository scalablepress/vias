import _ from 'lodash';
import objectHash from 'object-hash';

import {MODEL_CACHE_UPDATED, MODEL_PROMISE_UPDATED} from './constants';

import ViasPromise from './ViasPromise';

class Model {
  constructor(name, aliases = {}, methods = {}) {
    this.name = name;
    this.docs = {};
    this.promises = {};
    this.aliases = aliases;
    this.listeners = [];
    this.findResults = {};
    this.methods = methods;

    this.get = (alias, key, options) => {
      if (!this.methods.get) {
        throw new Error('Get method is not implemented');
      }

      let exec = (resolveCb, rejectCb) => {
        let docFromCache = this.getFromCache(alias, key, (options && options.expiry) || 0);
        if (docFromCache) {
          return resolveCb({alias, key});
        }

        this.methods.get(alias, key, options, (err, doc) => {
          if (err) {
            rejectCb(err);
          }

          if (!doc) {
            return rejectCb('Cannot find document');
          }

          this.saveToCache(doc, new Date());
          resolveCb({alias, key});
          this._broadcast(MODEL_CACHE_UPDATED);
        });
      };

      return new ViasPromise(this, 'get', {alias, key}, exec);
    };

    this.bulk = (alias, keys, options) => {
      if (!this.methods.bulk) {
        throw new Error('Bulk method is not implemented');
      }

      let exec = (resolveCb, rejectCb) => {
        let keysToGet = [];
        let result = {};
        for (let key of keys) {
          let docFromCache = this.getFromCache(alias, key, (options && options.expiry) || 0);
          if (docFromCache) {
            result[key] = docFromCache;
          } else {
            keysToGet.push(key);
          }
        }

        if (keysToGet.length === 0) {
          return resolveCb({alias, keys});
        }

        this.methods.bulk(alias, keysToGet, options, (err, remoteResult) => {
          if (err) {
            return rejectCb(err);
          }
          let fetchedAt = new Date();
          for (let doc of remoteResult) {
            this.saveToCache(doc, fetchedAt);
          }

          resolveCb({alias, keys});
          this._broadcast(MODEL_CACHE_UPDATED);
        });
      };

      let keysObj = {};
      for (let key of keys) {
        keysObj[key] = true;
      }

      return new ViasPromise(this, 'bulk', {alias, keys: keysObj}, exec);
    };

    this.find = (resource, data, options) => {
      if (!this.methods.find) {
        throw new Error('Find method is not implemented');
      }

      let exec = (resolveCb, rejectCb) => {
        let resultFromCache = this.getFindResult(resource, data, (options && options.expiry) || 0);
        if (resultFromCache) {
          return resolveCb({alias: resultFromCache.alias, key: resultFromCache.key, result: resultFromCache.result});
        }

        this.methods.find(resource, data, options, (err, result) => {
          if (err) {
            return rejectCb(err);
          }
          let fetchedAt = new Date();
          let alias = _.first(Object.keys(this.aliases));
          let path = this.aliases[alias];
          let aliasResult;
          if (_.isArray(result)) {
            for (let doc of result) {
              this.saveToCache(doc, fetchedAt);
              aliasResult.push(_.get(doc, path));
            }
            this.saveFindResult(resource, data, alias, {result}, fetchedAt);
            resolveCb({alias, result: aliasResult});
          } else if (_.isPlainObject(result)) {
            this.saveToCache(result);
            let key = _.get(result, path);
            resolveCb({alias, key});
            this.saveFindResult(resource, data, alias, {key}, fetchedAt);
          } else {
            throw new Error('Invalid result');
          }
          this._broadcast(MODEL_CACHE_UPDATED);
        });
      };

      return new ViasPromise(this, 'find', {resource, data}, exec);
    };
  }

  findCache() {
    return this.findResults;
  }

  getFindResult(resource, data, expiry) {
    let cache = this.findCache();
    let dataKey = objectHash(data);
    if (cache[resource] && cache[resource][dataKey]) {
      let expired;
      let cacheRecord = cache[resource][dataKey];
      if (expiry >= 0) {
        expired = (cacheRecord.fetchedAt).getTime() + expiry < new Date().getTime();
      } else {
        expired = false;
      }

      if (!expired || process.env.VIAS_ALL_CACHE) {
        if (cacheRecord.key) {
          let {alias, key} = cacheRecord;
          return this.getFromCache(alias, key, expiry);
        } else {
          let {alias, result} = cacheRecord;
          for (let key of result) {
            if (!this.getFromCache(alias, key, expiry)) {
              return null;
            }
          }
          return cacheRecord;
        }
      }
    }
    return null;
  }

  saveFindResult(resource, data, alias, {result, key}, fetchedAt) {
    let cache = this.findCache;
    let dataKey = objectHash(data);
    if (cache[resource]) {
      cache[resource] = {};
    }
    cache[resource][dataKey] = {alias, result, key, fetchedAt};
    this.findResults = cache;
  }

  cache() {
    return this.docs;
  }

  getFromCache(alias, key, expiry) {
    let cache = this.cache();
    if (cache[alias] && cache[alias][key]) {
      let expired;
      if (expiry >= 0) {
        expired = (cache[alias][key].fetchedAt).getTime() + expiry < new Date().getTime();
      } else {
        expired = false;
      }

      if (!expired || process.env.VIAS_ALL_CACHE) {
        return cache[alias][key].doc;
      }
    }
    return null;
  }

  saveToCache(doc, fetchedAt) {
    let cache = this.cache();
    fetchedAt = fetchedAt || new Date();
    for (let alias in this.aliases) {
      let path = this.aliases[alias];
      let key = _.get(doc, path);
      if (!_.isUndefined(key)) {
        if (!cache[alias]) {
          cache[alias] = {};
        }
        cache[alias][key] = {fetchedAt, doc};
      } else {
        throw new Error('Alias field is not defined');
      }
    }
    this.docs = cache;
  }

  _broadcast(event) {
    for (let listener of this.listeners) {
      setTimeout(function () {
        listener(event);
      });
    }
  }

  promisesStore() {
    return this.promises;
  }

  getPromise(groupId, promiseId) {
    let promises = this.promisesStore();
    if (promises[groupId] && promises[groupId][promiseId]) {
      return promises[groupId][promiseId];
    }
    return null;
  }

  storePromise(groupId, id, promise) {
    let promises = this.promisesStore();
    if (!promises[groupId]) {
      promises[groupId] = {};
    }
    promises[groupId][id] = promise;
    this._broadcast(MODEL_PROMISE_UPDATED);
    promise.onFinish(() => {
      this._broadcast(MODEL_PROMISE_UPDATED);
    });
    this.promises = promises;
  }

  clearPromise(groupId, promiseId) {
    if (this.promises[groupId]) {
      delete this.promises[groupId][promiseId];
      this._broadcast(MODEL_PROMISE_UPDATED);
    }
  }

  clearPromiseGroup(groupId) {
    delete this.promises[groupId];
  }

  subscribe(listener) {
    this.listeners.push(listener);
  }

  unsubsribe(listener) {
    let index = this.listeners.indexOf(listener);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
  }

}

export default Model;
