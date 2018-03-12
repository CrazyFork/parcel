const spawn = require('cross-spawn');

// spawn child process while pipe std & stderr to current process
function pipeSpawn(cmd, params, opts) {
  const cp = spawn(cmd, params, opts);
  cp.stdout.pipe(process.stdout);
  cp.stderr.pipe(process.stderr);
  return new Promise((resolve, reject) => {
    cp.on('error', reject);
    cp.on('close', function(code) {
      if (code !== 0) {
        return reject(new Error(cmd + ' failed.'));
      }

      return resolve();
    });
  });
}

module.exports = pipeSpawn;
