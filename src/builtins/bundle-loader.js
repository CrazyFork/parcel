var getBundleURL = require('./bundle-url').getBundleURL;

// load last bundle in bundles
// try to load bundle by id, if not found, then try load bundle by bundle name,
// then register it under desired bundle id
function loadBundlesLazy(bundles) {
  if (!Array.isArray(bundles)) {
    bundles = [bundles]
  }

  var id = bundles[bundles.length - 1]; // could be either name or id for this asset

  try {
    // this require ref to the global require variable in builtins/prelude file
    return Promise.resolve(require(id));
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND') {
      return new LazyPromise(function (resolve, reject) {
        loadBundles(bundles)
          .then(resolve, reject);
      });
    }

    throw err;
  }
}

function loadBundles(bundles) {
  var id = bundles[bundles.length - 1];

  // slice(0, -1), return all except the last one
  return Promise.all(bundles.slice(0, -1).map(loadBundle))
    .then(function () {
      return require(id);
    });
}

var bundleLoaders = {};
function registerBundleLoader(type, loader) {
  bundleLoaders[type] = loader;
}

module.exports = exports = loadBundlesLazy;
exports.load = loadBundles;
exports.register = registerBundleLoader;

var bundles = {};
// bundle: [bundle, id]
// load the target bundle, if found in cached, return cached version, else
// using registered loader to load target bundle
function loadBundle(bundle) {
  var id;
  if (Array.isArray(bundle)) {
    id = bundle[1];
    bundle = bundle[0];
  }

  if (bundles[bundle]) {
    return bundles[bundle];
  }

  var type = bundle.match(/\.(.+)$/)[1].toLowerCase();
  var bundleLoader = bundleLoaders[type];
  if (bundleLoader) {
    return bundles[bundle] = bundleLoader(getBundleURL() + bundle)
      .then(function (resolved) {
        if (resolved) {
          module.bundle.modules[id] = [function (require,module) { // :?
            module.exports = resolved;
          }, {}];
        }

        return resolved;
      });
  }
}

// delay execution on .then or .catch call
function LazyPromise(executor) {
  this.executor = executor;
  this.promise = null;
}

LazyPromise.prototype.then = function (onSuccess, onError) {
  return this.promise || (this.promise = new Promise(this.executor).then(onSuccess, onError));
};

LazyPromise.prototype.catch = function (onError) {
  return this.promise || (this.promise = new Promise(this.executor).catch(onError));
};
