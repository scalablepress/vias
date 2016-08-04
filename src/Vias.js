import async from 'async';
import React from 'react';
import hoistNonReactStatic from 'hoist-non-react-statics';

import {filterViasPromises} from './util';

// Fulfill all ViasPromise in the props
function fulfillPromises(props, promiseCache, options = {}, promiseCb, cb) {
  let promises = filterViasPromises(props);
  let toFulfill = [];
  for (let key in promises) {
    if (promises.hasOwnProperty(key)) {
      let promise = promises[key];
      promise.setKey(key).setPromiseCache(promiseCache);
      toFulfill.push(promise);
    }
  }

  async.each(toFulfill, (promise, eCb) => {
    promise.fulfill(options).onFinish((err) => {
      if (promiseCb) {
        promiseCb(err, promise);
      }
      eCb(err);
    });
  }, (err) => {
    async.setImmediate(() => cb && cb(err));
  });
}

// Check if server component is rendered in server side
let server = false;

// Flag to indicate if the first component has mounted
let first = true;

function vias() {
  return function (WrappedComponent) {
    class Vias extends React.Component {
      // Class method for fulfilling promises on the server
      static fulfillAll(props, cb) {
        // Set server to true
        // allow component to consume data synchronously
        server = true;
        fulfillPromises(props, {}, {}, null, cb);
      }

      constructor(props) {
        super(props);
        this.models = {};
        this.promises = {};
        // Try to consume the data synchronously
        // for server side rendered component
        // and the first vias component on client side
        if (first || server) {
          fulfillPromises(props, this.promises, {sync: true});
        }
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

      fulfillPromises(props) {
        fulfillPromises(props, this.promises, {}, () => {
          this.forceUpdate();
        });
      }

      componentWillMount() {
        if (!server) {
          this.fulfillPromises(this.props);
        }
        first = false;
      }

      componentWillReceiveProps(nextProps) {
        this.fulfillPromises(nextProps);
      }

      render() {
        return React.createElement(WrappedComponent, this.props);
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
