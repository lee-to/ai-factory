import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAgentConfig } from '../dist/core/agents.js';
import { initCommand } from '../dist/cli/commands/init.js';
import { updateSubagents } from '../dist/core/installer.js';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const fixtureRoot = await mkdtemp(path.join(os.tmpdir(), 'aif-loop-subagents-'));
const initialCwd = process.cwd();

try {
  for (const [agentId, extension] of [['claude', 'md'], ['codex', 'toml']]) {
    const runtime = getAgentConfig(agentId);
    const originalSource = runtime.agentsSourceDir;
    const sourceDir = path.join(fixtureRoot, `${agentId}-source`);
    const projectDir = path.join(fixtureRoot, `${agentId}-project`);
    await mkdir(sourceDir);
    await mkdir(projectDir);
    // Codex has no bundled loop roles yet. Use isolated source fixtures for both
    // runtimes so this verifies the rule for Markdown and TOML without shipping new roles.
    const loopFile = `loop-planner.${extension}`;
    const otherFile = `plan-polisher.${extension}`;
    await writeFile(path.join(sourceDir, loopFile), 'bundled loop role\n');
    await writeFile(path.join(sourceDir, otherFile), 'bundled planning role\n');
    runtime.agentsSourceDir = path.relative(repoRoot, sourceDir);
    process.chdir(projectDir);
    const target = file => path.join(projectDir, runtime.agentsDir, file);
    const readAgent = async () => JSON.parse(await readFile('.ai-factory.json', 'utf8')).agents[0];
    const assertNoLoopMetadata = agent => {
      assert(!agent.installedAgentFiles.includes(loopFile));
      assert.equal(agent.agentFileSources[loopFile], undefined);
      assert.equal(agent.managedAgentFiles[loopFile], undefined);
    };

    try {
      await initCommand({ agents: agentId, skills: 'aif' });
      assert(!existsSync(target(loopFile)), `${agentId}: unselected loop subagent must not be installed`);
      assert(existsSync(target(otherFile)));
      assertNoLoopMetadata(await readAgent());

      await initCommand({ agents: agentId, skills: 'aif,aif-loop' });
      assert(existsSync(target(loopFile)), `${agentId}: selected loop subagent must be installed`);
      let agent = await readAgent();
      assert(agent.installedAgentFiles.includes(loopFile));
      assert.equal(agent.agentFileSources[loopFile].kind, 'bundled');
      assert(agent.managedAgentFiles[loopFile]);

      const customFile = `loop-custom.${extension}`;
      await writeFile(target(customFile), 'user-owned loop role\n');
      await initCommand({ agents: agentId, skills: 'aif' });
      assert(!existsSync(target(loopFile)), `${agentId}: deselection must remove tracked loop subagents`);
      assertNoLoopMetadata(await readAgent());
      assert.equal(await readFile(target(customFile), 'utf8'), 'user-owned loop role\n');

      for (const force of [false, true]) {
        agent = await readAgent();
        const result = await updateSubagents(agent, projectDir, { force });
        assert(!existsSync(target(loopFile)), `${agentId}: update must not restore unselected loop roles`);
        assert(!result.installedAgentFiles.includes(loopFile));
        assert.equal(result.agentFileSources[loopFile], undefined);
      }

      // Migrate installations created before the selection rule, including
      // legacy metadata without per-file source ownership.
      for (const legacy of [false, true]) {
        agent = await readAgent();
        agent.installedAgentFiles.push(loopFile);
        if (!legacy) agent.agentFileSources[loopFile] = { kind: 'bundled', sourcePath: loopFile };
        await writeFile(target(loopFile), 'previously installed loop role\n');
        const result = await updateSubagents(agent, projectDir);
        assert(!existsSync(target(loopFile)), `${agentId}: update must remove previously tracked unselected loop roles`);
        assert(!result.installedAgentFiles.includes(loopFile));
        assert.equal(result.agentFileSources[loopFile], undefined);
        assert(result.entries.some(entry => entry.subagent === loopFile && entry.status === 'removed' && entry.reason === 'skill-not-selected'));
      }

      // Untracked files and extension-owned loop helpers are not bundled assets.
      await writeFile(target(loopFile), 'user-owned file at a bundled path\n');
      agent = await readAgent();
      const extensionFile = `loop-extension.${extension}`;
      await writeFile(target(extensionFile), 'extension-owned loop role\n');
      agent.installedAgentFiles.push(extensionFile);
      agent.agentFileSources[extensionFile] = { kind: 'extension', sourcePath: extensionFile, extensionName: 'example' };
      const result = await updateSubagents(agent, projectDir, { force: true });
      assert(result.installedAgentFiles.includes(extensionFile));
      assert.equal(result.agentFileSources[extensionFile].kind, 'extension');
      assert.equal(await readFile(target(loopFile), 'utf8'), 'user-owned file at a bundled path\n');
      assert.equal(await readFile(target(extensionFile), 'utf8'), 'extension-owned loop role\n');

      // Selecting the skill through update enables its bundled roles too.
      await rm(target(loopFile));
      agent.installedSkills.push('aif-loop');
      const selected = await updateSubagents(agent, projectDir);
      assert(existsSync(target(loopFile)));
      assert(selected.installedAgentFiles.includes(loopFile));

      await initCommand({ agents: agentId, skills: 'aif,aif-loop' });
      await initCommand({ agents: agentId, skills: false });
      assert(!existsSync(target(loopFile)));
      assertNoLoopMetadata(await readAgent());
      console.log(`${agentId} loop subagent selection smoke tests passed`);
    } finally {
      runtime.agentsSourceDir = originalSource;
    }
  }
} finally {
  process.chdir(initialCwd);
  await rm(fixtureRoot, { recursive: true, force: true });
}
