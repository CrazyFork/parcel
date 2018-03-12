/**
 * this module is used for node-browser-resolve for looking into global packages.
 * which in return used for looking for target asset.
*/
var builtins = require('node-libs-browser');

for (var key in builtins) {
  if (builtins[key] == null) {
    builtins[key] = require.resolve('./_empty.js');
  }
}

// register the _bundler_loader with acutal path of `./bundle-loader.js`
builtins['_bundle_loader'] = require.resolve('./bundle-loader.js');
builtins['_css_loader'] = require.resolve('./css-loader.js');

module.exports = builtins;
