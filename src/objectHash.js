import _ from 'lodash';

export default function objectHash(data) {
  if (_.isPlainObject(data)) {
    let keys = _.keys(data).sort();
    let rv = '{';
    for (let key of keys) {
      let value = objectHash(data[key]);
      if (!_.isUndefined(value)) {
        rv += `${JSON.stringify(key)}:${value},`;
      }
    }
    rv = rv.slice(0, rv.length - 1);
    rv += '}';
    return rv;
  }
  if (_.isArray(data)) {
    let rv = '[';
    for (let entry of data) {
      rv += objectHash(entry);
      rv += ',';
    }
    rv = rv.slice(0, rv.length - 1);
    rv += ']';
    return rv;
  }
  if (_.isNumber(data) || _.isUndefined(data)) {
    return data;
  }
  return JSON.stringify(data);
}
