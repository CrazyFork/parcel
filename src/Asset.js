const URL = require('url');
const path = require('path');
const fs = require('./utils/fs');
const objectHash = require('./utils/objectHash');
const md5 = require('./utils/md5');
const isURL = require('./utils/is-url');
const sanitizeFilename = require('sanitize-filename');
const config = require('./utils/config');

let ASSET_ID = 1;

/**
 * An Asset represents a file in the dependency tree. Assets can have multiple
 * parents that depend on it, and can be added to multiple output bundles.
 * The base Asset class doesn't do much by itself, but sets up an interface
 * for subclasses to implement.
 */
class Asset {
  /**
   *
   * @param {*} name
   * @param {*} pkg
   * @param {*} options
   *  target: string, (browser|)
   *  sourceMaps: boolean, whether to generate source map
   */
  constructor(name, pkg, options) {
    this.id = ASSET_ID++;
    this.name = name;
    this.basename = path.basename(this.name);
    this.relativeName = path.relative(options.rootDir, this.name);
    this.package = pkg || {};
    this.options = options;
    this.encoding = 'utf8';
    this.type = path.extname(this.name).slice(1); // ext name without `.`

    this.processed = false;
    this.contents = null; // raw content
    this.ast = null;  // ast data
    this.generated = null;
    this.hash = null; // unique has using ext & conent
    this.parentDeps = new Set(); //
    this.dependencies = new Map(); // this asset's deps
    this.depAssets = new Map();
    this.parentBundle = null;
    this.bundles = new Set(); // refernce to bundle, m2m mapping
    this.cacheData = {};
  }

  shouldInvalidate() {
    return false;
  }

  async loadIfNeeded() {
    if (this.contents == null) {
      this.contents = await this.load();
    }
  }

  async parseIfNeeded() {
    await this.loadIfNeeded();
    if (!this.ast) {
      this.ast = await this.parse(this.contents);
    }
  }

  async getDependencies() {
    await this.loadIfNeeded();

    // by default, assume this asset have deps, to extract that info, it content need to be parsed first
    if (this.contents && this.mightHaveDependencies()) {
      await this.parseIfNeeded();
      await this.collectDependencies();
    }
  }

  // name, relative path of this dependency,
  // opts, various options during parsing
  addDependency(name, opts) {
    this.dependencies.set(name, Object.assign({name}, opts));
  }

  // add a url path as dep, relative to this.name/from
  addURLDependency(url, from = this.name, opts) {
    if (!url || isURL(url)) {
      return url;
    }

    if (typeof from === 'object') {
      opts = from;
      from = this.name;
    }

    const parsed = URL.parse(url);
    const resolved = path.resolve(path.dirname(from), parsed.pathname);
    this.addDependency(
      './' + path.relative(path.dirname(this.name), resolved),
      Object.assign({dynamic: true}, opts)  // :todo, dynamic?
    );

    // :todo, get assets then what generateBundleName?
    parsed.pathname = this.options.parser
      .getAsset(resolved, this.package, this.options)
      .generateBundleName();

    return URL.format(parsed);
  }

  // get assets's configuration
  async getConfig(filenames) {
    // Resolve the config file
    let conf = await config.resolve(this.name, filenames);
    if (conf) {
      // Add as a dependency so it is added to the watcher and invalidates
      // this asset when the config changes.
      this.addDependency(conf, {includedInParent: true}); // :todo,  includedInParent
      return await config.load(this.name, filenames);
    }

    return null;
  }

  mightHaveDependencies() {
    return true;
  }

  async load() {
    return await fs.readFile(this.name, this.encoding);
  }

  parse() {
    // do nothing by default
  }

  collectDependencies() {
    // do nothing by default
  }

  async pretransform() {
    // do nothing by default
  }

  async transform() {
    // do nothing by default
  }

  // {[type: string]: [content: string]}
  async generate() {
    return {
      [this.type]: this.contents
    };
  }

  async process() {
    if (!this.generated) {
      await this.loadIfNeeded();
      await this.pretransform();
      await this.getDependencies();
      await this.transform();
      this.generated = await this.generate();
      this.hash = this.generateHash();
    }

    return this.generated;
  }

  // using type & file content
  generateHash() {
    return objectHash(this.generated);
  }

  invalidate() {
    this.processed = false;
    this.contents = null;
    this.ast = null;
    this.generated = null;
    this.hash = null;
    this.dependencies.clear();
    this.depAssets.clear();
  }

  invalidateBundle() {
    this.parentBundle = null;
    this.bundles.clear();
    this.parentDeps.clear();
  }

  // logics to generate bundle name
  generateBundleName() {
    // Resolve the main file of the package.json
    let main =
      this.package && this.package.main
        ? path.resolve(path.dirname(this.package.pkgfile), this.package.main)
        : null;
    let ext = '.' + this.type;

    // If this asset is main file of the package, use the sanitized package name
    if (this.name === main) {
      const packageName = sanitizeFilename(this.package.name, {
        replacement: '-'
      });
      return packageName + ext;
    }

    // If this is the entry point of the root bundle, use the original filename
    if (this.name === this.options.mainFile) {
      return path.basename(this.name, path.extname(this.name)) + ext;
    }

    // Otherwise generate a unique name
    return md5(this.name) + ext;
  }

  generateErrorMessage(err) {
    return err;
  }
}

module.exports = Asset;
