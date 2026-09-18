import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const WEB = resolve(__dirname, '..');
const OPENAPI_JSON = resolve(WEB, '../api/openapi.json');
const API_TYPES = join(WEB, 'src/lib/api-types.ts');

describe('generated contract', () => {
  it('src/lib/api-types.ts matches api/openapi.json (run `pnpm gen:api` at the root)', () => {
    const pkgJson = require.resolve('openapi-typescript/package.json');
    const cli = join(dirname(pkgJson), require(pkgJson).bin['openapi-typescript']);
    const out = join(mkdtempSync(join(tmpdir(), 'api-types-')), 'api-types.ts');
    execFileSync(process.execPath, [cli, OPENAPI_JSON, '-o', out], { stdio: 'pipe' });
    expect(readFileSync(API_TYPES, 'utf8')).toBe(readFileSync(out, 'utf8'));
  }, 30_000); // spawns the CLI — slower than vitest's 5 s default on a busy machine
});
