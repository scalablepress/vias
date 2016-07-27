import async from 'async';

import Model from './Model';
import ViasPromise from './ViasPromise';
import {viasPromiseValue, viasPromiseState} from './util';

// ViasPromise that depends on other ViasPromise

export class ViasDependPromise extends ViasPromise {
  constructor(dependModel, dependencies, dependExec) {
    super(dependModel);
    this.dependExec = dependExec;
    this.dependencies = dependencies;
  }

  cacheModel() {
    return this.dependant && this.dependant.model;
  }

  _computeDependant() {
    if (viasPromiseState(this.dependencies).fulfilled) {
      let dependencyValues = viasPromiseValue(this.dependencies);
      this.dependant = this.dependExec(dependencyValues);
      this.ready = true;
    }
  }

  _prepareExec() {
    this._computeDependant();
    if (this.ready) {
      if (this.dependant) {
        this.shape = this.dependant.shape;
        this._exec = this.dependant._exec;
        this.options = this.dependant.options;
        this.id = this.dependant.id;
        return this;
      } else {
        // Do not do anything if all dependencies are ready but the exec function return nothing
        this.id = 'noop';
        this._exec = (options, cb) => cb();
      }
    }
  }

  fulfill(options = {}) {

    // Compare promise with the same key stored in the cache
    // See if all dependencies are the same
    // If no, fulfill the dependences first, then the actual data request
    // If yes, the dependences should have already been fulfilled by the cached promise
    if (this.key && this.promiseCache) {
      let cachedPromise = this.promiseCache[this.key];
      if (cachedPromise) {
        let identicalDependency = true;
        for (let key in this.dependencies) {
          if (this.dependencies.hasOwnProperty(key)) {
            let dependency = this.dependencies[key];
            if (cachedPromise.dependencies[key].id !== dependency.id) {
              identicalDependency = false;
              break;
            }
          }
        }
        if (identicalDependency) {
          this._prepareExec();
          if (this.ready) {
            return super.fulfill(options);
          }
        }
      }
      this.promiseCache[this.key] = this;
    }

    this.pending = true;
    async.forEachOf(this.dependencies, (promise, key, fCb) => {
      let dependencyOptions = {};
      if (options.sync) {
        dependencyOptions.sync = true;
      }
      promise.fulfill(dependencyOptions).onFinish(fCb);
    }, (err) => {
      if (err) {
        this.reason = err;
        this.pending = this.fulfilled = false;
        this.rejected = true;
        return this._broadcast();
      }
      this._prepareExec();
      return super.fulfill(options);
    });
    return this;
  }
}

// Speical vias model to handle depend promise
let Depend = new Model('Depend');

function toRun(dependencies) {
  return {
    run: function (dependExec) {
      return new ViasDependPromise(Depend, dependencies || {}, dependExec);
    },
  };
}

Depend.set = function (dependencies) {
  return toRun(dependencies);
};

export default Depend;
