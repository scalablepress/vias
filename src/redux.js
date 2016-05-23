import _ from 'lodash';
import Model from './Model';
import {ViasDependPromise} from './ViasDepend';

const INIT_MODELS = 'VIAS_INIT_MODELS';

function initModels(models) {
  return {
    type: INIT_MODELS,
    models,
  };
}

const MODEL_UPDATE = 'VIAS_MODEL_UPDATE';

function updateModel(model, event) {
  return {
    type: MODEL_UPDATE,
    model,
    event,
  };
}

const reduceHandlers = {
  [INIT_MODELS]: function (state, {models}) {
    let newState = Object.assign({}, state);
    for (let model of models) {
      newState[model.name] = model;
      newState.__SNAPSHOTS__[model.name] = model.snapshot();
    }
    return newState;
  },
  [MODEL_UPDATE]: function (state, {model}) {
    let __SNAPSHOTS__ = Object.assign({}, state.__SNAPSHOTS__);
    __SNAPSHOTS__[model.name] = model.snapshot();
    let newState = Object.assign({}, state, {__SNAPSHOTS__});
    return newState;
  },
};

export function viasReducer(state = {__SNAPSHOTS__: {}}, action) {
  let handler = reduceHandlers[action.type];
  if (handler) {
    return handler(state, action);
  } else {
    return state;
  }
}

export class ReduxModel extends Model {
  static connect(store, model) {
    if (!(model instanceof Model)) {
      throw new Error('Cannot connect non Vias Model');
    }
    let newModel = new ReduxModel(store, model.name, model.aliases, model.methods);
    return newModel;
  }

  constructor(store, name, aliases = {}, methods = {}) {
    super(name, aliases, methods);
    this.storeGetState = store.getState;
    this.storeDispatch = store.dispatch;
  }

  cache() {
    return this.storeGetState().vias.__SNAPSHOTS__[this.name].docs;
  }

  findCache() {
    return this.storeGetState().vias.__SNAPSHOTS__[this.name].findResults;
  }

  promiseStore() {
    return this.storeGetState().vias.__SNAPSHOTS__[this.name].promises;
  }

  _broadcast(event) {
    this.storeDispatch(updateModel(this, event));
  }

  snapshot() {
    return _.cloneDeep({docs: this.docs, findResults: this.findResults, promises: this.promises});
  }
}

export function viasConnect(store, ...models) {
  let ViasDepend = new ReduxModel(store, 'ViasDepend');
  ViasDepend.exec = function (dependencies, dependExec) {
    return new ViasDependPromise(this, dependencies, dependExec);
  };
  let reduxModels = [ViasDepend];
  for (let model of models) {
    reduxModels.push(ReduxModel.connect(store, model));
  }
  store.dispatch(initModels(reduxModels));
}
