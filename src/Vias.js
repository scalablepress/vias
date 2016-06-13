import _ from 'lodash';
import async from 'async';
import React from 'react';

import ViasPromise from './ViasPromise';
import {ViasDependPromise} from './Depend';

function vias(options = {}) {
  return function (WrappedComponent) {
    class Vias extends React.Component {
      static fulfillPromises(promises, onPromiseFinish, cb) {
        async.each(promises, function (promise, eCb) {
          promise.exec((err, result) => {
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
        this.promises = {};
      }

      subscribeModel(model) {
        if (!this.models[model.name]) {
          this.models[model.name] = {
            model: model,
            listener: () => {
              this.forceUpdate();
            },
          };
        }
      }

      extendPromises(promiseMap) {
        let promises = {};
        for (let key in promiseMap) {
          let promise = promiseMap[key];
          if (promise instanceof ViasDependPromise) {
            let dependencies = {};
            for (let key in promise.dependencies) {
              let dependency = promise.dependencies[key];
              if (dependency.id && this.promises[dependency.id]) {
                dependencies[key] = this.promises[dependency.id];
              }
            }
            promise.update(_.extend({}, promise.dependencies, dependencies));
          }

          if (promise instanceof ViasPromise && promise.id && this.promises[promise.id]) {
            promises[key] = this.promises[promise.id];
          }
        }
        return _.extend({}, promiseMap, promises);
      }

      fulfillPromises(props) {
        let toFulfill = [];
        let promisesMap = this.extendPromises(props);
        for (let key in promisesMap) {
          if (promisesMap[key] instanceof ViasPromise) {
            let promise = promisesMap[key];
            if (promise.id && this.promises[promise.id]) {
              promise = this.promises[promise.id];
            } else if (promise.id) {
              this.promises[promise.id] = promise;
            }

            if (!promise.started) {
              toFulfill.push(promise);
            }
          }
        }

        Vias.fulfillPromises(toFulfill, (err, promise) => {
          this.promises[promise] = Object.assign({}, promise);
          this.fulfillPromises(this.props);
          this.subscribeModel(promise.cacheModel());
          this.forceUpdate();
        });
      }

      componentWillMount() {
        this.fulfillPromises(this.props);
      }

      componentWillReceiveProps(nextProps) {
        this.fulfillPromises(nextProps);
      }

      render() {
        return React.createElement(WrappedComponent, _.extend({}, this.props, this.extendPromises(this.props)));
      }

      componentWillUnmount() {
        for (let name in this.models) {
          if (this.models.hasOwnProperty(name)) {
            let {model, listener} = this.models[name];
            model.unsubscribe(listener);
          }
        }
      }
    }
    return Vias;
  };
}

export default vias;
