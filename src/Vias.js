import React from 'react';
import hoistNonReactStatic from 'hoist-non-react-statics';

import {filterViasPromises, asyncEachOf, _setImmediate} from './util';

// Fulfill all ViasPromise in the props
function fulfillPromises(props, promiseCache, options = {}, promiseCb, cb) {
  let promises = filterViasPromises(props);
  let toAdd = Object.assign({}, promises);
  let count = Object.keys(promises).length;
  let toFulfill = [];
  // Put promise in order so that promises with dependencies will be fulfilled after their dependencies
  while (toFulfill.length < count) {
    for (let [key, promise] of Object.entries(toAdd)) {
      if (promise.dependencies) {
        let dependenciesAdded = true;
        for (let [dependencyKey, dependency] of Object.entries(promise.dependencies)) {
          if (!promises[dependencyKey]) {
            throw `Depency ${dependencyKey} of ${key} is not in props`;
          }
          if (!dependency.key) {
            dependenciesAdded = false;
            break;
          }
        }
        if (!dependenciesAdded) {
          continue;
        }
      }
      promise.setKey(key).setPromiseCache(promiseCache);
      toFulfill.push(promise);
      delete toAdd[key];
    }
  }

  asyncEachOf(toFulfill, (promise, index, eCb) => {
    promise.fulfill(options).onFinish((err) => {
      if (promiseCb) {
        promiseCb(err, promise);
      }
      eCb(err);
    });
  }, (err) => {
    _setImmediate(() => cb && cb(err));
  });
}

// Check if server component is rendered in server side
let server = typeof window === 'undefined';

// Flag to indicate if the first component has mounted
let first = true;

function vias() {
  return function (WrappedComponent) {
    class Vias extends React.Component {
      // Class method for fulfilling promises on the server
      static fulfillAll(props, cb) {
        // allow component to consume data synchronously
        fulfillPromises(props, {}, {}, null, cb);
      }

      constructor(props) {
        super(props);
        this.models = {};
        // Promise cache to prevent promise with same data fulfill twice
        this.promises = {};
        // Try to consume the data synchronously
        // for server side rendered component
        // and the first vias component on client side
        if (first || server) {
          fulfillPromises(props, this.promises, {sync: true});
        }
      }

      // subscribeModel(model) {
      //   if (!this.models[model.name]) {
      //     this.models[model.name] = {
      //       model: model,
      //       listener: () => {
      //         this.forceUpdate();
      //       },
      //     };
      //   }
      // }

      fulfillPromises(props) {
        fulfillPromises(props, this.promises, {}, () => {
          this.forceUpdate();
        });
      }

      componentWillMount() {
        if (!server) {
          this.fulfillPromises(this.props);
        }
        _setImmediate(() => {
          first = false;
        });
      }

      componentWillReceiveProps(nextProps) {
        this.fulfillPromises(nextProps);
      }

      render() {
        return React.createElement(WrappedComponent, this.props);
      }

      // componentWillUnmount() {
      //   for (let name in this.models) {
      //     if (this.models.hasOwnProperty(name)) {
      //       let {model, listener} = this.models[name];
      //       model.unsubscribe(listener);
      //     }
      //   }
      // }
    }
    return hoistNonReactStatic(Vias, WrappedComponent);
  };
}

export default vias;
