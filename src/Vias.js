import _ from 'lodash';
import async from 'async';
import React from 'react';
import hoistNonReactStatic from 'hoist-non-react-statics';


import ViasPromise from './ViasPromise';
import {ViasDependPromise} from './Depend';

function fulfillReady(promises, onPromiseFinish, cb) {
  async.each(promises, function (promise, eCb) {
    promise.exec((err, result) => {
      if (onPromiseFinish) {
        onPromiseFinish(err, promise, result);
      }
      return eCb(err, result);
    });
  }, cb);
}

function extendPromises(props, promiseMap) {
  let promises = {};
  for (let key in props) {
    let promise = props[key];
    if (promise instanceof ViasDependPromise) {
      let dependencies = {};
      for (let key in promise.dependencies) {
        let dependency = promise.dependencies[key];
        if (dependency.id && promiseMap[dependency.id]) {
          dependencies[key] = promiseMap[dependency.id];
        }
      }
      promise.update(_.extend({}, promise.dependencies, dependencies));
    }

    if (promise instanceof ViasPromise && promise.id && promiseMap[promise.id]) {
      promises[key] = promiseMap[promise.id];
    }
  }
  return _.extend({}, props, promises);
}

function fulfilling(props, promiseMap) {
  let toFulfill = [];
  let promiseProps = extendPromises(props, promiseMap);
  for (let key in promiseProps) {
    if (promiseProps[key] instanceof ViasPromise) {
      let promise = promiseProps[key];
      if (promise.id && promiseMap[promise.id]) {
        promise = promiseMap[promise.id];
      } else if (promise.id) {
        promiseMap[promise.id] = promise;
      }

      if (!promise.started) {
        toFulfill.push(promise);
      }
    }
  }
  return toFulfill;
}

function allFulfilled(promiseMap) {
  return _.every(promiseMap, (promise) => {
    return promise.rejected || promise.fulfilled;
  });
}

function fulfillAll(props, cb) {
  let promiseMap = {};
  let calledBack = false;

  function callback(err, result) {
    if (!calledBack) {
      return cb(err, result);
    }
    calledBack = true;
  }

  function iterate() {
    let toFulfill = fulfilling(props, promiseMap);
    if (toFulfill.length <= 0) {
      if (allFulfilled(promiseMap)) {
        return callback();
      }
      return;
    }

    fulfillReady(toFulfill, (err) => {
      if (err) {
        return callback(err);
      }
      return iterate();
    });
  }

  iterate();
}

function vias() {
  return function (WrappedComponent) {
    class Vias extends React.Component {
      // Fulfill ViasPromise and ready ViasDependPromise
      static fulfillAll(props, cb) {
        fulfillAll(props, cb);
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

      extendPromises(props) {
        return extendPromises(props, this.promises);
      }


      fulfillPromises(props) {
        let toFulfill = fulfilling(props, this.promises);
        if (toFulfill.length <= 0) {
          return;
        }

        fulfillReady(toFulfill, (err, promise) => {
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
    return hoistNonReactStatic(Vias, WrappedComponent);
  };
}

export default vias;
