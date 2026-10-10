// Manual Voice Lab entrypoint, using the same runtime descriptor as Electron.
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const configured = process.env.RACERCORE_SUITE_ROOT;
if (!configured) throw Error('Set RACERCORE_SUITE_ROOT to the suite containing the prepared runtimes.');
const root = fs.realpathSync(configured);
if (fs.realpathSync(path.join(root, 'acc-telemetry-dashboard/nuxt')) !== fs.realpathSync(path.resolve(__dirname, '..'))) {
    throw Error('Configured suite does not reference this frontend.');
}
const { describeKokoro } = require(path.join(root, 'desktop-app/runtime/kokoroLaunch'));
const launch = describeKokoro({ root, appRoot: path.join(root, 'desktop-app') });
const child = spawn(launch.executable, launch.arguments, {
    cwd: launch.cwd, env: launch.environment, stdio: 'inherit', windowsHide: true,
});
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 1; });
