import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { execute } from '../dist/core/swarm/process.js';

const temp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'aif-swarm-processes-')));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const leaf = path.join(temp, 'leaf.cjs'), middle = path.join(temp, 'middle.cjs'), root = path.join(temp, 'root.cjs');
await fs.writeFile(leaf, `const fs=require('fs'),prefix=process.argv[2];fs.writeFileSync(prefix+'.leaf',String(process.pid));const beat=()=>fs.writeFileSync(prefix+'.beat',String(Date.now()));beat();setInterval(beat,50);`);
await fs.writeFile(middle, `const fs=require('fs'),{spawn}=require('child_process'),prefix=process.argv[2];fs.writeFileSync(prefix+'.middle',String(process.pid));spawn(process.execPath,[${JSON.stringify(leaf)},prefix],{detached:true,stdio:'ignore'});setInterval(()=>{},1000);`);
await fs.writeFile(root, `const fs=require('fs'),{spawn}=require('child_process'),prefix=process.argv[2];fs.writeFileSync(prefix+'.root',String(process.pid));spawn(process.execPath,[${JSON.stringify(middle)},prefix],{detached:true,stdio:'ignore'});setInterval(()=>{if(fs.existsSync(prefix+'.overflow')){fs.unlinkSync(prefix+'.overflow');process.stdout.write(Buffer.alloc(4*1024*1024+1,'x'));}},20);`);
const unrelatedPrefix = path.join(temp, 'unrelated');
const unrelated = spawn(process.execPath, [leaf, unrelatedPrefix], { detached: true, stdio: 'ignore' });
async function ready(file) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const value = await fs.readFile(file, 'utf8').catch(() => '');
    if (value) return value;
    await delay(20);
  }
  throw new Error(`Fixture did not start: ${file}`);
}
try {
  await ready(unrelatedPrefix + '.beat');
  for (const mode of ['abort', 'timeout', 'overflow', 'inspection-failure']) {
    const prefix = path.join(temp, mode), abort = new AbortController();
    const operation = execute(process.execPath, [root, prefix], temp, mode === 'timeout' ? 2000 : 15000, abort.signal);
    // Observe rejection immediately; the assertion below still checks its exact outcome.
    const outcome = operation.then(result => ({ result }), error => ({ error }));
    const previousPath = process.env.PATH;
    try {
      await ready(prefix + '.beat');
      if (mode === 'inspection-failure') process.env.PATH = temp;
      if (mode === 'abort' || mode === 'inspection-failure') abort.abort();
      if (mode === 'overflow') await fs.writeFile(prefix + '.overflow', 'ready');
      const { result, error } = await outcome;
      if (mode === 'timeout') assert.equal(result?.timedOut, true);
      else assert.match(error?.message ?? '', mode === 'abort' ? /cancelled/ : mode === 'inspection-failure' ? /Process tree cleanup failed/ : /output limit/);
      // A heartbeat distinguishes a live orphan from a zombie awaiting reaping.
      const stopped = await fs.readFile(prefix + '.beat', 'utf8');
      const other = await fs.readFile(unrelatedPrefix + '.beat', 'utf8');
      await delay(250);
      if (mode !== 'inspection-failure') assert.equal(await fs.readFile(prefix + '.beat', 'utf8'), stopped, `${mode} left a detached descendant running`);
      assert.notEqual(await fs.readFile(unrelatedPrefix + '.beat', 'utf8'), other, `${mode} killed an unrelated process`);
    } finally {
      if (previousPath === undefined) delete process.env.PATH; else process.env.PATH = previousPath;
      abort.abort(); await outcome;
      for (const suffix of ['leaf', 'middle', 'root']) {
        const pid = Number(await fs.readFile(prefix + '.' + suffix, 'utf8').catch(() => '0'));
        if (pid) { try { process.kill(-pid, 'SIGKILL'); } catch { /* Owned fixture already stopped. */ } }
      }
    }
  }
  const success = await execute(process.execPath, ['-e', 'process.stdout.write("OK")'], temp, 10000);
  assert.equal(success.stdout, 'OK'); assert.equal(success.code, 0);
  console.log('PASS swarm processes: detached descendants stop on abort/timeout/overflow, unrelated processes survive, inspection failures are reported');
} finally {
  if (unrelated.pid) { try { process.kill(-unrelated.pid, 'SIGKILL'); } catch { /* Already stopped. */ } }
  await new Promise(resolve => unrelated.exitCode !== null || unrelated.signalCode !== null ? resolve() : unrelated.once('exit', resolve));
  await fs.rm(temp, { recursive: true, force: true });
}
