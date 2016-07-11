import _ from 'lodash';
import ViasPromise from './ViasPromise';

const STATUSES = ['pending', 'fulfilled', 'rejected'];

export function filterViasPromises(viasPromises) {
  if (viasPromises instanceof ViasPromise) {
    return viasPromises;
  }

  if (_.isArray(viasPromises)) {
    return _.filter(viasPromises, (vp) => vp instanceof ViasPromise);
  }
  if (_.isPlainObject(viasPromises)) {
    return _.pick(viasPromises, (vp) => vp instanceof ViasPromise);
  }

  throw new Error('Invalid parameters');
}

export function viasPromiseValue(viasPromises) {
  viasPromises = filterViasPromises(viasPromises);
  if (viasPromises instanceof ViasPromise) {
    return viasPromises.populate();
  }

  if (_.isArray(viasPromises)) {
    return _.map(viasPromises, vp => vp.populate());
  }

  if (_.isPlainObject(viasPromises)) {
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

  if (_.isArray(viasPromises) || _.isPlainObject(viasPromises)) {
    let promise = _.find(viasPromises, promise => promise.reason);
    return promise && promise.reason;
  }

  throw new Error('Invalid parameters');
}

export function viasPromiseState(viasPromises) {
  viasPromises = filterViasPromises(viasPromises);
  if (viasPromises instanceof ViasPromise) {
    return _.pick(viasPromises, STATUSES);
  }

  if (_.isArray(viasPromises) || _.isPlainObject(viasPromises)) {
    return {
      pending: _.some(viasPromises, 'pending'),
      fulfilled: _.every(viasPromises, 'fulfilled'),
      rejected: _.some(viasPromises, 'rejected'),
    };
  }

  throw new Error('Invalid parameters');
}
