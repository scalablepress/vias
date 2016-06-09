export const MODEL_CACHE_UPDATED = 'VIAS_MODEL_CACHE_UPDATED';
export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const FOREVER = -1;

export const DOCUMENT_SHAPE = () => null;
export const OBJECT_SHAPE = function (result) {
  let paths = [];
  for (let key in result) {
    if (result.hasOwnProperty(key)) {
      paths.push(key);
    }
  }
  return paths;
};

export const ARRAY_SHAPE = OBJECT_SHAPE;
