const {dirname} = require('path');
const resolve = require('resolve');
const install = require('./installPackage');

const cache = new Map();

// require package at target path, if not found then try install that then require it
// return requried result
async function localRequire(name, path, triedInstall = false) {
  let basedir = dirname(path);
  let key = basedir + ':' + name;
  let resolved = cache.get(key);
  if (!resolved) {
    try {
      // resolve entry file under specific path using nodejs module resolving specification
      resolved = resolve.sync(name, {basedir});
    } catch (e) {
      if (e.code === 'MODULE_NOT_FOUND' && !triedInstall) {
        await install(path, [name]);
        return localRequire(name, path, true);
      }
      throw e;
    }
    cache.set(key, resolved);
  }

  return require(resolved);
}

module.exports = localRequire;
