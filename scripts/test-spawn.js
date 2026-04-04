const { spawn } = require('child_process');
const path = require('path');

const exePath = path.resolve('release/win-unpacked/Automated Video Generator.exe');
const cliPath = path.resolve('release/win-unpacked/resources/app/node_modules/tsx/dist/cli.mjs');
const serverPath = path.resolve('release/win-unpacked/resources/app/src/server.ts');

console.log('Spawning:', exePath);
const child = spawn(exePath, [cliPath, serverPath], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', ELECTRON_BACKEND_SERVER: '1' }
});

child.stdout.on('data', d => console.log('OUT:', d.toString()));
child.stderr.on('data', d => console.error('ERR:', d.toString()));
child.on('exit', c => {
    console.log('EXIT:', c)
    process.exit(c)
});
