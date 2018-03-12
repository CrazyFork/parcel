const babel = require('babel-core');

module.exports = async function(asset) {
  if (!await shouldTransform(asset)) {
    return;
  }

  await asset.parseIfNeeded();

  let config = {
    code: false,
    filename: asset.name
  };

  if (asset.isES6Module) {
    config.babelrc = false;
    config.plugins = [
      require('babel-plugin-transform-es2015-modules-commonjs') // save dependence
    ];
  }
  // 由于js生态问题, babel 文档缺失, 导致我只能猜测这个意思, 应该是从es6语法转换成es5 commonjs 语法
  let res = babel.transformFromAst(asset.ast, asset.contents, config);
  if (!res.ignored) {
    asset.ast = res.ast;
    asset.isAstDirty = true; //:?
  }
};

async function shouldTransform(asset) {
  if (asset.isES6Module) {
    return true;
  }

  if (asset.ast) {
    return !!asset.babelConfig;
  }

  if (asset.package && asset.package.babel) {
    return true;
  }

  let babelrc = await asset.getConfig(['.babelrc', '.babelrc.js']);
  return !!babelrc;
}
