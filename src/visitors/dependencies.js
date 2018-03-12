const types = require('babel-types');
const template = require('babel-template');
const urlJoin = require('../utils/urlJoin');
const isURL = require('../utils/is-url');
const matchesPattern = require('./matches-pattern');

const requireTemplate = template('require("_bundle_loader")');
const argTemplate = template('require.resolve(MODULE)'); // :?
const serviceWorkerPattern = ['navigator', 'serviceWorker', 'register'];

// visit import, daynamic import, service worker register, web worker to gather resource dependence data.
module.exports = {
  ImportDeclaration(node, asset) {
    asset.isES6Module = true;
    addDependency(asset, node.source);
  },

  ExportNamedDeclaration(node, asset) {
    asset.isES6Module = true;
    if (node.source) {
      addDependency(asset, node.source);
    }
  },

  ExportAllDeclaration(node, asset) {
    asset.isES6Module = true;
    addDependency(asset, node.source);
  },

  ExportDefaultDeclaration(node, asset) {
    asset.isES6Module = true;
  },

  CallExpression(node, asset) {
    let {callee, arguments: args} = node;

    let isRequire =
      types.isIdentifier(callee) &&
      callee.name === 'require' &&
      args.length === 1 &&
      types.isStringLiteral(args[0]);

    if (isRequire) {
      addDependency(asset, args[0]);
      return;
    }

    let isDynamicImport =
      callee.type === 'Import' &&
      args.length === 1 &&
      types.isStringLiteral(args[0]);

    if (isDynamicImport) {
      asset.addDependency('_bundle_loader');
      addDependency(asset, args[0], {dynamic: true});

      node.callee = requireTemplate().expression;
      node.arguments[0] = argTemplate({MODULE: args[0]}).expression;
      asset.isAstDirty = true;
      return;
    }

    const isRegisterServiceWorker =
      types.isStringLiteral(args[0]) &&
      matchesPattern(callee, serviceWorkerPattern); // :bm, service worker also got checked?

    if (isRegisterServiceWorker) {
      addURLDependency(asset, args[0]);
      return;
    }
  },

  NewExpression(node, asset) {
    const {callee, arguments: args} = node;

    const isWebWorker =
      callee.type === 'Identifier' &&
      callee.name === 'Worker' &&
      args.length === 1 &&
      types.isStringLiteral(args[0]);

    if (isWebWorker) {
      addURLDependency(asset, args[0]);
      return;
    }
  }
};

function addDependency(asset, node, opts = {}) {
  if (asset.options.target !== 'browser') {
    const isRelativeImport =
      node.value.startsWith('/') || // `/` this counts for relative path?
      node.value.startsWith('./') ||
      node.value.startsWith('../');

    if (!isRelativeImport) return;
  }

  opts.loc = node.loc && node.loc.start;
  asset.addDependency(node.value, opts);
}

function addURLDependency(asset, node) {
  let assetPath = asset.addURLDependency(node.value);
  if (!isURL(assetPath)) {
    assetPath = urlJoin(asset.options.publicURL, assetPath);
  }
  node.value = assetPath;
  asset.isAstDirty = true;
}
