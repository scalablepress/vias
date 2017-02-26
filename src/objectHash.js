import {isUndefined, isPlainObject} from './util';

// Stable json stringify that the keys are sorted
export default function objectHash(data) {
  if (isPlainObject(data)) {
    let keys = Object.keys(data).sort();
    let rv = '{';
    for (let key of keys) {
      let value = objectHash(data[key]);
      if (!isUndefined(value)) {
        rv += `${JSON.stringify(key)}:${value},`;
      }
    }
    rv = rv.slice(0, rv.length - 1);
    rv += '}';
    return rv;
  }
  if (Array.isArray(data)) {
    let rv = '[';
    for (let entry of data) {
      rv += objectHash(entry);
      rv += ',';
    }
    rv = rv.slice(0, rv.length - 1);
    rv += ']';
    return rv;
  }
  if (typeof data === 'number' || isUndefined(data)) {
    return data;
  }
  return JSON.stringify(data);
}
