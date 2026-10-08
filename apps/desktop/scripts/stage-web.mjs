// Copies the web app's standalone server build into apps/desktop/web for packaging.
import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '../../web');
const out = join(here, '../web');
const standalone = join(web, '.next/standalone');
if (!existsSync(join(standalone, 'apps/web/server.js'))) {
  console.error('No standalone build found. Run `npm run build -w @questwright/web` first.');
  process.exit(1);
}
rmSync(out, { recursive: true, force: true });
cpSync(standalone, out, { recursive: true });
cpSync(join(web, '.next/static'), join(out, 'apps/web/.next/static'), { recursive: true });
cpSync(join(web, 'public'), join(out, 'apps/web/public'), { recursive: true });
// Never ship local env files.
for (const f of ['.env', '.env.local']) rmSync(join(out, 'apps/web', f), { force: true });
console.log('Staged web app in', out);
