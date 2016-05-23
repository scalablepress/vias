import _ from 'lodash';
import async from 'async';
import React from 'react';

import ViasPromise from './ViasPromise';

function vias(options = {}) {
  return function (WrappedComponent) {
    class Vias extends React.Component {
      static fulfillPromises(props, groupId, onPromiseFinish, cb) {
        let toFulfill = [];
        for (let key in props) {
          if (props[key] instanceof ViasPromise) {
            toFulfill.push({promise: props[key], promiseId: key});
          }
        }

        async.each(toFulfill, function ({promise, promiseId}, eCb) {
          promise.fulfill(groupId, promiseId).onFinish((err, result) => {
            if (onPromiseFinish) {
              onPromiseFinish(err, promise, result);
            }
            return eCb(err, result);
          });
        }, cb);
      }

      constructor(props) {
        super(props);
        this.models = {};
        this.viasGroupId = _.uniqueId();
      }

      subscribeModel(model) {
        if (!this.models[model.name]) {
          this.models[model.name] = {
            model: model,
            listener: () => {
              this.forceUpdate();
            },
          };
          if (!options.noModelSubscription) {
            model.subscribe(this.models[model.name].listener);
          }
        }
      }

      fulfillPromises(props) {
        Vias.fulfillPromises(props, this.viasGroupId, (err, promise) => {
          this.forceUpdate();
          this.subscribeModel(promise.cacheModel());
        });
      }

      componentWillMount() {
        this.fulfillPromises(this.props);
      }

      componentWillReceiveProps(nextProps) {
        this.fulfillPromises(nextProps);
      }

      render() {
        return React.createElement(WrappedComponent, this.props);
      }

      componentWillUnmount() {
        for (let name in this.models) {
          let {model, listener} = this.models[name];
          model.unsubsribe(listener);
          model.clearPromiseGroup(this.viasGroupId);
        }
      }
    }
    return Vias;
  };
}

export default vias;
