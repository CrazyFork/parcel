const fs = require('./fs');
const path = require('path');

const PARSERS = {
  json: require('json5').parse,
  toml: require('toml').parse
};

const existsCache = new Map();

// search any file with name `filenames` existed in siblingpath as `filepath`, return first find file
async function resolve(filepath, filenames, root = path.parse(filepath).root) {
  filepath = path.dirname(filepath);

  // Don't traverse above the module root
  if (filepath === root || path.basename(filepath) === 'node_modules') {
    return null;
  }

  for (const filename of filenames) {
    let file = path.join(filepath, filename);
    let exists = existsCache.has(file)
      ? existsCache.get(file)
      : await fs.exists(file);
    if (exists) {
      existsCache.set(file, true);
      return file;
    }
  }

  return resolve(filepath, filenames, root);
}
// load filename configuration, then return parsed config obj
async function load(filepath, filenames, root = path.parse(filepath).root) {
  let configFile = await resolve(filepath, filenames, root);
  if (configFile) {
    try {
      let extname = path.extname(configFile).slice(1);
      if (extname === 'js') {
        return require(configFile);
      }

      let configStream = await fs.readFile(configFile);
      let parse = PARSERS[extname] || PARSERS.json;
      return parse(configStream.toString());
    } catch (err) {
      if (err.code === 'MODULE_NOT_FOUND' || err.code === 'ENOENT') {
        existsCache.delete(configFile);
        return null;
      }

      throw err;
    }
  }

  return null;
}

exports.resolve = resolve;
exports.load = load;
