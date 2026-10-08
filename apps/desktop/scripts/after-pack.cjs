// electron-builder hook: copies the staged web server (apps/desktop/web) into the
// packaged app's resources folder. extraResources cannot do this because
// electron-builder always leaves out node_modules, and the server needs it.
const { cpSync, existsSync } = require('node:fs');
const { join } = require('node:path');

exports.default = async function afterPack(context) {
  const from = join(__dirname, '../web');
  if (!existsSync(join(from, 'apps/web/server.js'))) {
    throw new Error('No staged web app. Run `npm run desktop:stage` first.');
  }
  const resources =
    context.electronPlatformName === 'darwin'
      ? join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
      : join(context.appOutDir, 'resources');
  const to = join(resources, 'web');
  cpSync(from, to, { recursive: true, verbatimSymlinks: true });
  if (!existsSync(join(to, 'node_modules/next/package.json'))) {
    throw new Error(`Packaged server is missing node_modules/next in ${to}`);
  }
  console.log(`  • copied web server  to=${to}`);
};
