import Model from './Model';
import Depend from './Depend';
import {clone} from './util';

const INIT_MODELS = 'VIAS/INIT_MODELS';

function initModels(models) {
  return {
    type: INIT_MODELS,
    models,
  };
}

const MODEL_UPDATE = 'VIAS/MODEL_UPDATE';

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
      // If model already exists in redux(state sent from server), keep its cache
      if (newState[model.name]) {
        newState[model.name] = Object.assign(model, {
          docs: newState[model.name].docs,
          customResults: newState[model.name].customResults,
        });
      } else {
        newState[model.name] = model;
      }
    }
    return newState;
  },
  [MODEL_UPDATE]: function (state, {model}) {
    let newState = Object.assign({}, state, {[model.name]: model.snapshot()});
    return newState;
  },
};

export function viasReducer(state = {}, action) {
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
    let newModel = new ReduxModel(store, model.name, model.aliases, model.methods, model.custom);
    // Depend model function
    newModel.set = model.set;
    newModel.run = model.run;
    return newModel;
  }

  constructor(store, name, aliases = {}, methods = {}, custom = {}) {
    super(name, aliases, methods, custom);
    this.storeGetState = store.getState;
    this.storeDispatch = store.dispatch;
  }

  _broadcast(event) {
    // When promises get resolved/update, dispatch a redux action and update the state
    this.storeDispatch(updateModel(this, event));
  }

  snapshot() {
    // Get new copy of the model for new redux state
    return Object.assign({}, this, {docs: clone(this.docs), customResults: clone(this.customResults)});
  }
}

export function viasConnect(store, ...models) {
  models.push(Depend);
  let reduxModels = models.map((model) => ReduxModel.connect(store, model));
  store.dispatch(initModels(reduxModels));
}
