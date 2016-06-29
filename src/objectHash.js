import _ from 'lodash';

export default function objectHash(data) {
  if (_.isPlainObject(data)) {
    return JSON.stringify(_.sortBy(_.pairs(_.mapValues(data, objectHash)), ([key]) => key));
  }
  if (_.isArray(data)) {
    return JSON.stringify(_.map(data, objectHash));
  }
  if (_.isString(data)) {
    return data;
  }
  return JSON.stringify(data);
}
