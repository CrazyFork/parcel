const crypto = require('crypto');

// md5 target string
function md5(string) {
  return crypto
    .createHash('md5')
    .update(string)
    .digest('hex');
}

module.exports = md5;
