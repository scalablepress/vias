import _ from 'lodash';

import Model from './Model';
import ViasPromise from './ViasPromise';
import {viasPromiseValue} from './util';

export class ViasDependPromise extends ViasPromise {
  constructor(dependModel, dependencies, dependExec) {
    super(dependModel);
    this.dependExec = dependExec;
    this.update(dependencies);
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

    this.dependant = this._computeDependant();
    this.shape = this.dependant.shape;
    this._exec = this.dependant._exec;
    this.id = this.dependant.id;
    return this;
  }

  _computeDependant() {
    let dependencyValues = viasPromiseValue(this.dependencies);
    return this.dependExec(dependencyValues);
  }

  fulfill() {
    this.pending = true;

    if (this._exec) {
      super.fulfill();
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

Depend.set = function (dependencies) {
  this.dependencies = dependencies;
  return this;
};

Depend.run = function (dependExec) {
  return new ViasDependPromise(this, this.dependencies || {}, dependExec);
};

export default Depend;
