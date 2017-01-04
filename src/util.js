import ViasPromise from './ViasPromise';
import _ from 'lodash';

export function asyncEachOf(collection, handler, finalCallback) {
  let called = false;
  function cb(err) {
    if (!called) {
      called = true;
      finalCallback(err);
    }
  }
  let size = Object.keys(collection).length;
  if (size === 0) {
    return cb();
  }
  let finish = 0;
  function callback(err) {
    finish++;
    if (err) {
      return cb(err);
    }
    if (finish >= size) {
      return cb();
    }
  }
  for (let [key, item] of Object.entries(collection)) {
    handler(item, key, callback);
  }
}

let _defer;
if (typeof setImmediate === 'function') {
  _defer = setImmediate;
} else if (typeof process === 'object' && typeof process.nextTick === 'function') {
  _defer = process.nextTick;
} else {
  _defer = (fn) => {
    setTimeout(fn, 0);
  };
}

export function _setImmediate(fn) {
  _defer(fn);
}

export function isUndefined(val) {
  return val === undefined;
}

export function isPlainObject(value) {
  if (!value) {
    return false;
  }
  if (typeof value !== 'object') {
    return false;
  }

  let proto = Object.getPrototypeOf(Object(value));
  if (proto === null) {
    return true;
  }

  return proto.constructor && typeof proto.constructor === 'function'
    && proto.constructor instanceof proto.constructor && proto.constructor.toString() === Object.toString();

}

function toPath(string) {
  let result = [];
  if (/^\./.test(string)) {
    result.push('');
  }
  let prop = /[^.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]|(?=(?:\.|\[\])(?:\.|\[\]|$))/g;
  string.replace(prop, (match, number, quote, string) => {
    result.push(quote ? string.replace(/[\\^$.*+?()[\]{}|]/g, '$1') : (number || match));
  });
  return result;
}

export function pathValue(object, pathStr) {
  let path = toPath(pathStr);
  let obj = object;
  for (let item of path) {
    if (!obj) {
      return undefined;
    }
    obj = obj[item];
  }
  return obj;
}

export function setValueByPath(object, pathStr, value) {
  let path = toPath(pathStr);
  let obj = object;
  let lastPath = path.pop();
  for (let item of path) {
    if (!obj) {
      throw new Error(`Cannot access ${pathStr}`);
    }
    obj = obj[item];
  }
  obj[lastPath] = value;
}

export function clone(toClone) {
  return _.cloneDeep(toClone);
  // return JSON.parse(JSON.stringify(toClone));
}

export function filterViasPromises(viasPromises) {
  if (viasPromises instanceof ViasPromise) {
    return viasPromises;
  }

  if (Array.isArray(viasPromises)) {
    return viasPromises.filter((vp) => vp instanceof ViasPromise);
  }

  if (isPlainObject(viasPromises)) {
    let results = {};
    for (let [key, vp] of Object.entries(viasPromises)) {
      if (vp instanceof ViasPromise) {
        results[key] = vp;
      }
    }
    return results;
  }

  throw new Error('Invalid parameters');
}

export function viasPromiseValue(viasPromises) {
  viasPromises = filterViasPromises(viasPromises);
  if (viasPromises instanceof ViasPromise) {
    return viasPromises.populate();
  }

  if (Array.isArray(viasPromises)) {
    return viasPromises.map(vp => vp.populate());
  }

  if (isPlainObject(viasPromises)) {
    let result = {};
    for (let key in viasPromises) {
      if (viasPromises.hasOwnProperty(key)) {
        result[key] = viasPromises[key].populate();
      }
    }

    return result;
  }
  throw new Error('Invalid parameters');
}


export function viasPromiseReason(viasPromises) {
  viasPromises = filterViasPromises(viasPromises);
  if (viasPromises instanceof ViasPromise) {
    return viasPromises.reason;
  }

  if (Array.isArray(viasPromises) || isPlainObject(viasPromises)) {
    let found;
    for (let [, promise] of Object.entries(viasPromises)) {
      if (promise.reason) {
        found = promise;
        break;
      }
    }
    return found && found.reason;
  }

  throw new Error('Invalid parameters');
}

export function viasPromiseState(viasPromises) {
  viasPromises = filterViasPromises(viasPromises);
  if (viasPromises instanceof ViasPromise) {
    return {
      pending: viasPromises.pending,
      fulfilled: viasPromises.fulfilled,
      rejected: viasPromises.rejected,
    };
  }

  if (Array.isArray(viasPromises) || isPlainObject(viasPromises)) {
    let promises = Object.values(viasPromises);
    return {
      pending: promises.some(p => p.pending),
      fulfilled: promises.every(p => p.fulfilled),
      rejected: promises.some(p => p.rejected),
    };
  }

  throw new Error('Invalid parameters');
}
