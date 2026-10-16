import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

test('deployment server exposes health and browser assets, restricts files, and exits cleanly', { timeout: 15000 }, async t => {
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: new URL('../', import.meta.url),
    env: { ...process.env, HOST: '0.0.0.0', PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => { if (child.exitCode === null) child.kill('SIGKILL'); });
  const url = await new Promise((resolve, reject) => {
    let output = '';
    child.on('error', reject);
    child.on('exit', code => reject(new Error(`Server exited before startup (${code}): ${output}`)));
    child.stderr.on('data', chunk => { output += chunk; });
    child.stdout.on('data', chunk => {
      output += chunk;
      const match = output.match(/http:\/\/0\.0\.0\.0:(\d+)/);
      if (match) resolve(`http://127.0.0.1:${match[1]}`);
    });
  });
  const health = await fetch(`${url}/healthz`);
  assert.equal(health.status, 200);
  assert.equal(await health.text(), 'ok\n');
  for (const [path, type] of [
    ['/', 'text/html'], ['/app.js', 'text/javascript'], ['/editor-state.js', 'text/javascript'], ['/engine.js', 'text/javascript'],
    ['/worker.js', 'text/javascript'], ['/tile-art.js', 'text/javascript'], ['/styles.css', 'text/css'],
  ]) {
    const response = await fetch(`${url}${path}`);
    assert.equal(response.status, 200, path);
    assert.ok(response.headers.get('content-type').startsWith(type), path);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.ok((await response.text()).length > 0, path);
  }
  const head = await fetch(url, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  for (const path of ['/server.mjs', '/package.json', '/.git/config', '/missing']) {
    assert.equal((await fetch(`${url}${path}`)).status, 404, path);
  }
  const post = await fetch(url, { method: 'POST' });
  assert.equal(post.status, 405);
  assert.equal(post.headers.get('allow'), 'GET, HEAD');
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  assert.deepEqual(await exited, [0, null]);
});
