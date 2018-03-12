const promisify = require('./utils/promisify');
const resolve = require('browser-resolve');
const resolveAsync = promisify(resolve);
const builtins = require('./builtins');
const path = require('path');
const glob = require('glob');

// :?
class Resolver {
  /**
   *
   * @param {*} options
   *    extentions:, values pass into 'browser resolve' function
   *    paths: string, values pass into 'browser resolve' function  
   */
  constructor(options = {}) {
    this.options = options;
    this.cache = new Map();
  }

  async resolve(filename, parent) {
    var resolved = await this.resolveInternal(filename, parent, resolveAsync);
    return this.saveCache(filename, parent, resolved);
  }

  resolveSync(filename, parent) {
    var resolved = this.resolveInternal(filename, parent, resolve.sync);
    return this.saveCache(filename, parent, resolved);
  }

  resolveInternal(filename, parent, resolver) {
    let key = this.getCacheKey(filename, parent);
    if (this.cache.has(key)) {
      return this.cache.get(key);
    }

    // https://github.com/isaacs/node-glob
    // Returns true if there are any special characters in the pattern, and false otherwise.
    if (glob.hasMagic(filename)) {
      return {path: path.resolve(path.dirname(parent), filename)};
    }

    let extensions = Object.keys(this.options.extensions);
    if (parent) {
      const parentExt = path.extname(parent);
      // parent's extension given high priority
      extensions = [parentExt, ...extensions.filter(ext => ext !== parentExt)];
    }

    // https://github.com/defunctzombie/node-browser-resolve
    return resolver(filename, {
      filename: parent,
      // require.paths array to use if nothing is found on the normal node_modules recursive walk
      // in other words, it works like python path, or PATH variable in OS that used looking for binaries.
      // in this case , this path is used looking for target libaries
      paths: this.options.paths,
      // {[moduleName: string]: [path: string]}
      modules: builtins,
      // doc has no description of this field
      extensions: extensions,
      // transform the parsed package.json contents before looking at the main field
      packageFilter(pkg, pkgfile) {
        // Expose the path to the package.json file
        pkg.pkgfile = pkgfile;

        // libraries like d3.js specifies node.js specific files in the "main" which breaks the build
        // we use the "module" or "jsnext:main" field to get the full dependency tree if available
        const main = [pkg.module, pkg['jsnext:main']].find(
          entry => typeof entry === 'string'
        );

        if (main) {
          pkg.main = main;
        }

        return pkg;
      }
    });
  }

  getCacheKey(filename, parent) {
    return (parent ? path.dirname(parent) : '') + ':' + filename;
  }

  saveCache(filename, parent, resolved) {
    if (Array.isArray(resolved)) {
      resolved = {path: resolved[0], pkg: resolved[1]};
    } else if (typeof resolved === 'string') {
      resolved = {path: resolved, pkg: null};
    }

    this.cache.set(this.getCacheKey(filename, parent), resolved);
    return resolved;
  }
}

module.exports = Resolver;
