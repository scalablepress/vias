import _ from 'lodash';
import objectHash from 'object-hash';

import {MODEL_CACHE_UPDATED, DOCUMENT_SHAPE, ARRAY_SHAPE, FOREVER} from './constants';
import ViasPromise from './ViasPromise';

let isNode = false;
if (typeof process === 'object') {
  if (typeof process.versions === 'object') {
    if (typeof process.versions.node !== 'undefined') {
      isNode = true;
    }
  }
}

class Model {
  constructor(name, aliases = {}, methods = {}, custom = {}) {
    this.name = name;
    this.docs = {};
    this.aliases = aliases;
    this.listeners = [];
    this.customResults = {};

    this.methods = methods;
    this.custom = custom;

    this.get = (alias, key, options) => {
      if (!methods.get) {
        throw new Error('Get method is not implemented');
      }

      let exec = (cb) => {
        let docFromCache = this.getFromCache(alias, key, (options && options.expiry) || 0);
        if (docFromCache) {
          return cb(null, {alias, result: key});
        }

        methods.get(alias, key, options, (err, doc) => {
          if (err) {
            cb(err);
          }

          if (!doc) {
            return cb('Cannot find document');
          }

          this.save(doc, new Date());
          cb(null, {alias, result: key});
          this._broadcast(MODEL_CACHE_UPDATED);
        });
      };

      return new ViasPromise(this, 'get', {alias, key}, DOCUMENT_SHAPE, exec);
    };

    this.bulk = (alias, keys = [], options = {}) => {
      if (!methods.bulk) {
        throw new Error('Bulk method is not implemented');
      }

      let exec = (cb) => {
        let keysToGet = [];
        let result = {};
        for (let key of keys) {
          let docFromCache = this.getFromCache(alias, key, options.expiry || 0);
          if (docFromCache) {
            result[key] = docFromCache;
          } else {
            keysToGet.push(key);
          }
        }

        if (keysToGet.length === 0) {
          return cb(null, {alias, result: keys});
        }

        methods.bulk(alias, keysToGet, options, (err, remoteResult) => {
          if (err) {
            return cb(err);
          }
          let fetchedAt = new Date();
          for (let doc of remoteResult) {
            this.save(doc, fetchedAt);
          }

          cb(null, {alias, result: keys});
          this._broadcast(MODEL_CACHE_UPDATED);
        });
      };

      let keysObj = {};
      for (let key of keys) {
        keysObj[key] = true;
      }

      return new ViasPromise(this, 'bulk', {alias, keys: keysObj}, ARRAY_SHAPE, exec);
    };

    for (let methodName in custom) {
      if (custom.hasOwnProperty(methodName)) {
        let {shape, action} = custom[methodName];
        this[methodName] = (data = {}, options = {}) => {
          let exec = (cb) => {
            let resultFromCache = this.getCustomResult(methodName, data, shape, options.expiry || 0);
            if (resultFromCache) {
              return cb(null, {alias: resultFromCache.alias, key: resultFromCache.key, result: resultFromCache.result}, resultFromCache.meta);
            }
            action(data, options, (err, result, meta) => {
              if (err) {
                return cb(err);
              }
              let fetchedAt = new Date();
              let alias = _.first(Object.keys(this.aliases));
              let aliasPath = this.aliases[alias];
              let aliasResult;
              let documentPaths = shape(result);
              if (!documentPaths) {
                aliasResult = _.get(result, aliasPath);
              } else {
                aliasResult = _.cloneDeep(result);
                for (let path of documentPaths) {
                  let doc = _.get(result, path);
                  this.save(doc, fetchedAt);
                  _.set(aliasResult, path, _.get(doc, aliasPath));
                }
              }
              this.saveCustomResult(methodName, data, alias, aliasResult, meta, fetchedAt);
              cb(null, {alias, result: aliasResult}, meta);
              this._broadcast(MODEL_CACHE_UPDATED);
            });
          };
          return new ViasPromise(this, methodName, {data}, shape, exec);
        };
      }
    }
  }

  customCache() {
    return this.customResults;
  }

  getCustomResult(method, data, shape, expiry) {
    if (isNode) {
      expiry = FOREVER;
    }
    let cache = this.customCache();
    let dataKey = objectHash(data);
    if (cache[method] && cache[method][dataKey]) {
      let expired;
      let cacheRecord = cache[method][dataKey];
      if (expiry >= 0) {
        expired = new Date(cacheRecord.fetchedAt).getTime() + expiry < new Date().getTime();
      } else {
        expired = false;
      }

      if (!expired) {
        // Refetch if any record passed the expiry
        let aliasPaths = shape(cacheRecord.result);
        if (!aliasPaths) {
          if (!this.getFromCache(cacheRecord.alias, cacheRecord.result, expiry)) {
            return null;
          }
        }
        for (let path of aliasPaths) {
          let key = _.get(cacheRecord.result, path);
          if (!this.getFromCache(cacheRecord.alias, key, expiry)) {
            return null;
          }
        }
        return cacheRecord;
      }
    }
    return null;
  }

  saveCustomResult(method, data, alias, result, meta, fetchedAt) {
    let cache = this.customCache();
    let dataKey = objectHash(data);
    if (!cache[method]) {
      cache[method] = {};
    }
    cache[method][dataKey] = {alias, result, meta, fetchedAt};
    this.customResults = cache;
  }

  cache() {
    return this.docs;
  }

  getFromCache(alias, key, expiry) {
    if (isNode) {
      expiry = FOREVER;
    }
    let cache = this.cache();
    if (cache[alias] && cache[alias][key]) {
      let expired;
      if (expiry >= 0) {
        expired = (new Date(cache[alias][key].fetchedAt)).getTime() + expiry < new Date().getTime();
      } else {
        expired = false;
      }

      if (!expired || process.env.VIAS_ALL_CACHE) {
        return cache[alias][key].doc;
      }
    }
    return null;
  }

  save(doc, fetchedAt) {
    let cache = this.cache();
    fetchedAt = fetchedAt || new Date();
    for (let alias in this.aliases) {
      if (this.aliases.hasOwnProperty(alias)) {
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

  subscribe(listener) {
    this.listeners.push(listener);
  }

  unsubscribe(listener) {
    let index = this.listeners.indexOf(listener);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
  }

}

export default Model;
