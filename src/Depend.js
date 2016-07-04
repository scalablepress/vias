import _ from 'lodash';

import Model from './Model';
import ViasPromise from './ViasPromise';
import {viasPromiseValue, viasPromiseState} from './util';

export class ViasDependPromise extends ViasPromise {
  constructor(dependModel, dependencies, dependExec) {
    super(dependModel);
    this.dependExec = dependExec;
    if (dependencies) {
      this.update(dependencies);
    }
  }

  cacheModel() {
    return this.dependant && this.dependant.model;
  }

  update(dependencies) {
    this.dependencies = dependencies || {};

    for (let dependency of _.values(this.dependencies)) {
      if (!dependency instanceof ViasPromise) {
        throw new Error('Dependency is not a ViasPromise');
      }
      if (!dependency.fulfilled) {
        return this;
      }
    }
    this._prepareExec();
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
    if (this.dependant) {
      this.shape = this.dependant.shape;
      this._exec = this.dependant._exec;
      this.options = this.dependant.options;
      this.id = this.dependant.id;
      return this;
    } else {
      this._exec = (options, cb) => cb();
    }
  }

  fulfill(options = {}) {
    if (this.ready && !this.dependant) {
      this.fulfilled = true;
      return this;
    }

    this.pending = true;

    if (options.sync) {
      for (let key in this.dependencies) {
        if (this.dependencies.hasOwnProperty(key)) {
          let promise = this.dependencies[key];
          if (!promise.fulfilled) {
            promise.fulfill({sync: true});
          }
        }
      }
      this._prepareExec();
    }

    if (this.dependant) {
      return super.fulfill(options);
    }

    return this;
  }

  onFinish(callback) {
    if (this._exec) {
      super.onFinish(callback);
    }
  }
}


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
