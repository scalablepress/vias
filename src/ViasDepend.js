import _ from 'lodash';
import async from 'async';

import Model from './Model';
import ViasPromise from './ViasPromise';
import {viasPromiseValue} from './util';

//const DependModel = new Model('ViasDepend');

export class ViasDependPromise extends ViasPromise {
  constructor(dependModel, dependencies, dependExec) {
    super(dependModel);
    this.dependencies = dependencies || {};
    this.dependExec = dependExec;
  }

  complyDependencies(vd) {
    if (!(vd instanceof ViasDependPromise)) {
      throw new Error('Cannot comply non-ViasDependPromise');
    }

    for (let key in this.dependencies) {
      if (this.dependencies[key].equals(vd.dependencies[key])) {
        vd.dependencies[key] = this.dependencies[key];
      }
    }
  }

  cacheModel() {
    return this.dependant && this.dependant.model;
  }

  _computeDependant() {
    let dependencyValues = viasPromiseValue(this.dependencies);
    return this.dependExec(dependencyValues);
  }

  _equalDependencies(vd) {
    if (Object.keys(this.dependencies).length !== Object.keys(vd.dependencies).length) {
      return false;
    }
    for (let key in this.dependencies) {
      if (!this.dependencies[key].equals(vd.dependencies[key])) {
        return false;
      }
    }
    return true;
  }

  comply(viasPromise) {
    this._complyAttr(viasPromise);
    viasPromise.onFinish(() => {
      this._complyAttr(viasPromise);
      this.dependant = viasPromise.dependant;
      this.exec = viasPromise.dependant.exec;
      this._broadcast();
    });
  }

  fulfill(groupId, promiseId) {
    this.pending = true;

    let storedPromise = this.storedPromise(groupId, promiseId);

    if (storedPromise) {
      this.comply(storedPromise);
    } else {
      if (groupId && promiseId) {
        this.model.storePromise(groupId, promiseId, this);
      }
      let pendingDependencies = [];
      for (let dependency of _.values(this.dependencies)) {
        if (!dependency instanceof ViasPromise) {
          throw new Error('Dependency is not a ViasPromise');
        }

        if (dependency.rejected) {
          this.rejected = true;
          this.reason = dependency.reason;
          this._broadcast();
          return this;
        }

        if (dependency.pending) {
          pendingDependencies.push(function (cb) {
            dependency.onFinish(cb);
          });
        }
      }

      async.parallel(pendingDependencies, err => {
        if (err) {
          this.rejected = true;
          this.reason = err;
          return;
        }


        this.dependant = this._computeDependant();
        this.exec = this.dependant.exec;
        super.fulfill();
      });
    }

    return this;
  }

  equals(vp) {
    if (!(vp instanceof ViasDependPromise)) {
      return false;
    }

    if (!this._equalDependencies(vp)) {
      return false;
    }

    if (this.dependant || vp.dependant) {
      if (this.dependant) {
        this.complyDependencies(vp);
      } else {
        vp.complyDependencies(this);
      }
      let d1 = this._computeDependant();
      let d2 = vp._computeDependant();
      return d1.equals(d2);
    } else {
      return true;
    }
  }
}


let ViasDepend = new Model('ViasDepend');

ViasDepend.depend = function (dependencies) {
  this.dependencies = dependencies;
  return this;
};

ViasDepend.exec = function (dependExec) {
  return new ViasDependPromise(this, this.dependencies || {}, dependExec);
};

export default ViasDepend;
