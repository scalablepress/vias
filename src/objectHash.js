import _ from 'lodash';

export default function (data) {
  if (_.isPlainObject(data)) {
    return JSON.stringify(_.sortBy(_.pairs(data), ([key]) => key));
  }
  return JSON.stringify(data);
}
