import objectHash from './objectHash';
import {MODEL_CACHE_UPDATED, DOCUMENT_SHAPE, ARRAY_SHAPE} from './constants';
import ViasPromise from './ViasPromise';
import {isUndefined, pathValue, setValueByPath, clone} from './util';

class Model {
  constructor(name, aliases = {}, methods = {}, custom = {}) {
    this.name = name;
    this.docs = {};
    this.aliases = aliases;
    this.listeners = [];
    this.customResults = {};

    this.methods = methods;
    this.custom = custom;

    // Only cache document when at least one alias is available to act as a key
    this.cachable = Object.keys(aliases).length > 0;

    // Get operation, request should return one document
    this.get = (alias, key, options) => {
      if (!methods.get) {
        throw new Error('Get method is not implemented');
      }

      if (!this.cachable) {
        throw new Error('No alias set up');
      }

      let exec = (options = {}, cb) => {
        let docFromCache = this.fromCache(alias, key, options.expiry || 0, options.sync);
        if (docFromCache) {
          return cb(null, {alias, result: key});
        }

        // Do not fetch from remote if sync options is flagged and nothing can be found in cached
        // Used for server-side-rendeing and first time data consume for front-end
        if (options.sync) {
          return cb();
        }

        methods.get(alias, key, options, (err, doc) => {
          if (err) {
            return cb(err);
          }

          if (!doc) {
            return cb(null, {alias});
          }

          this.save(doc, new Date());
          cb(null, {alias, result: key});
          this._broadcast(MODEL_CACHE_UPDATED);
        });
      };

      return new ViasPromise(this, 'get', {alias, key}, options, DOCUMENT_SHAPE, exec);
    };

    // Bulk operation, request should return array of document
    this.bulk = (alias, keys = [], options = {}) => {
      if (!methods.bulk) {
        throw new Error('Bulk method is not implemented');
      }

      if (!this.cachable) {
        throw new Error('No alias set up');
      }

      let exec = (options = {}, cb) => {
        let keysToGet = [];
        let result = {};
        let resultKeys = [];
        for (let key of keys) {
          let docFromCache = this.fromCache(alias, key, options.expiry || 0, options.sync);
          if (docFromCache) {
            result[key] = docFromCache;
            resultKeys.push(key);
          } else {
            keysToGet.push(key);
          }
        }

        if (keysToGet.length === 0) {
          return cb(null, {alias, result: resultKeys});
        }

        if (options.sync) {
          return cb();
        }

        methods.bulk(alias, keysToGet, options, (err, remoteResult) => {
          if (err) {
            return cb(err);
          }
          let fetchedAt = new Date();
          for (let doc of remoteResult) {
            this.save(doc, fetchedAt);
            let path = this.aliases[alias];
            let key = pathValue(doc, path);
            resultKeys.push(key);
          }

          cb(null, {alias, result: resultKeys});
          this._broadcast(MODEL_CACHE_UPDATED);
        });
      };

      let keysObj = {};
      for (let key of keys) {
        keysObj[key] = true;
      }

      return new ViasPromise(this, 'bulk', {alias, keys: Object.keys(keysObj).sort()}, options, ARRAY_SHAPE, exec);
    };

    // Custom operation, request can return in any shape the user defined
    for (let methodName in custom) {
      if (custom.hasOwnProperty(methodName)) {
        let {shape, action} = custom[methodName];
        this[methodName] = (data = {}, options = {}) => {
          let exec = (options = {}, cb) => {

            if (this.cachable) {
              let resultFromCache = this.customResult(methodName, data, shape, options.expiry || 0, options.sync);
              if (resultFromCache) {
                return cb(null, {alias: resultFromCache.alias, key: resultFromCache.key, result: resultFromCache.result}, resultFromCache.meta);
              }
            }

            if (options.sync) {
              return cb();
            }

            action(data, options, (err, result, meta) => {
              if (err) {
                return cb(err);
              }

              if (this.cachable) {

                let fetchedAt = new Date();
                let alias = Object.keys(this.aliases)[0];
                let aliasPath = this.aliases[alias];
                let aliasResult;
                let documentPaths = shape(result);
                if (!documentPaths) {
                  aliasResult = pathValue(result, aliasPath);
                  this.save(result, fetchedAt);
                } else {
                  aliasResult = clone(result);
                  for (let path of documentPaths) {
                    let doc = pathValue(result, path);
                    this.save(doc, fetchedAt);
                    setValueByPath(aliasResult, path, pathValue(doc, aliasPath));
                  }
                }

                this.saveCustomResult(methodName, data, alias, aliasResult, meta, fetchedAt);
                cb(null, {alias, result: aliasResult}, meta);
                this._broadcast(MODEL_CACHE_UPDATED);

              } else {
                cb(null, {result}, meta);
              }

            });
          };
          return new ViasPromise(this, methodName, {data}, options, shape, exec);
        };
      }
    }
  }

  // Get customer operation result from cache
  customResult(method, data, shape, expiry, sync) {
    let cache = this.customResults;
    let dataKey = objectHash(data);
    if (cache[method] && cache[method][dataKey]) {
      let expired;
      let cacheRecord = cache[method][dataKey];
      if (expiry >= 0 && !sync) {
        expired = new Date(cacheRecord.fetchedAt).getTime() + expiry < new Date().getTime();
      } else {
        expired = false;
      }

      if (!expired) {
        // Refetch if any record passed the expiry
        let aliasPaths = shape(cacheRecord.result);
        if (!aliasPaths) {
          if (!this.fromCache(cacheRecord.alias, cacheRecord.result, expiry, sync)) {
            return null;
          }
        } else {
          for (let path of aliasPaths) {
            let key = pathValue(cacheRecord.result, path);
            if (!this.fromCache(cacheRecord.alias, key, expiry, sync)) {
              return null;
            }
          }
        }
        return cacheRecord;
      }
    }
    return null;
  }

  // Save customer operation result to cache
  saveCustomResult(method, data, alias, result, meta, fetchedAt) {
    let cache = this.customResults;
    let dataKey = objectHash(data);
    if (!cache[method]) {
      cache[method] = {};
    }
    // Only save the alias name and the alias, not the actual document
    // Document should be populated using the document cache
    cache[method][dataKey] = {alias, result, meta, fetchedAt};
    this.customResults = cache;
  }

  // Get document from cache
  fromCache(alias, key, expiry, sync) {
    let cache = this.docs;
    if (cache[alias] && cache[alias][key]) {
      let expired;
      if (expiry >= 0 && !sync) {
        expired = (new Date(cache[alias][key].fetchedAt)).getTime() + expiry < new Date().getTime();
      } else {
        expired = false;
      }

      if (!expired) {
        return cache[alias][key].doc;
      }
    }
    return null;
  }

  // Save document to cache
  save(doc, fetchedAt) {
    let cache = this.docs;
    fetchedAt = fetchedAt || new Date();
    for (let alias in this.aliases) {
      if (this.aliases.hasOwnProperty(alias)) {
        let path = this.aliases[alias];
        let key = pathValue(doc, path);
        if (!isUndefined(key)) {
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
