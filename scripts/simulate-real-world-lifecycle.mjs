import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import assert from 'assert';

const ROOT_DIR = path.resolve('.');
const CLI_PATH = path.join(ROOT_DIR, 'bin', 'ai-factory.js');
const BASE_SIM_DIR = path.join(ROOT_DIR, 'temp-simulations');

const AIF_CANONICAL = fs.readFileSync(path.join(ROOT_DIR, 'skills', 'aif', 'SKILL.md'), 'utf8');
const AIF_PLAN_CANONICAL = fs.readFileSync(path.join(ROOT_DIR, 'skills', 'aif-plan', 'SKILL.md'), 'utf8');
const AIF_DISTILLATION_CANONICAL = fs.readFileSync(path.join(ROOT_DIR, 'skills', 'aif-distillation', 'SKILL.md'), 'utf8');

const LEGACY_AG_VARS = {
  config_dir: '.agent',
  skills_dir: '.agent/skills',
  home_skills_dir: '~/.agent/skills',
  settings_file: '',
  agent_name: 'Antigravity',
  skills_cli_agent_flag: '--agent antigravity',
};

const CLAUDE_VARS = {
  config_dir: '.claude',
  skills_dir: '.claude/skills',
  home_skills_dir: '~/.claude/skills',
  settings_file: '',
  agent_name: 'Claude Code',
  skills_cli_agent_flag: '--agent claude',
};

function renderTemplate(content, vars) {
  return content
    .replaceAll('~/{{skills_dir}}', vars.home_skills_dir)
    .replace(/\{\{(config_dir|skills_dir|home_skills_dir|settings_file|agent_name|skills_cli_agent_flag)\}\}/g, (_, key) => vars[key]);
}

function simplifyFrontmatter(content) {
  return content.replace(/^---\n([\s\S]*?)\n---/, (match, fm) => {
    const lines = fm.split('\n');
    const filtered = lines.filter(l => l.startsWith('name:') || l.startsWith('description:'));
    return `---\n${filtered.join('\n')}\n---`;
  });
}

function cleanSimDir(dir) {
  if (fs.existsSync(dir)) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {}
  }
}

function runCli(args, cwd) {
  return execSync(`node "${CLI_PATH}" ${args} 2>&1`, {
    cwd,
    encoding: 'utf8',
    stdio: 'pipe',
  });
}

let passedCount = 0;
let totalCount = 0;

function runSim(name, fn) {
  totalCount++;
  const simDir = path.join(BASE_SIM_DIR, `sim-${totalCount}`);
  cleanSimDir(simDir);
  fs.mkdirSync(simDir, { recursive: true });
  process.stdout.write(`[SIM ${String(totalCount).padStart(2, '0')}] ${name} ... `);
  try {
    fn(simDir);
    console.log('PASSED ✓');
    passedCount++;
  } catch (error) {
    console.log('FAILED ✗');
    console.error(error.message);
    throw error;
  } finally {
    cleanSimDir(simDir);
  }
}

console.log('='.repeat(70));
console.log('STARTING REAL-WORLD USER LIFECYCLE SIMULATIONS (PR #166 ZERO DATA LOSS)');
console.log('='.repeat(70));

cleanSimDir(BASE_SIM_DIR);
fs.mkdirSync(BASE_SIM_DIR, { recursive: true });

// --- SIMULATION 1: Antigravity 2.0 Init -> modify native agent -> update preserves modifications
runSim('Antigravity 2.0 Init -> modify native agent -> update preserves modification', (dir) => {
  runCli('init --agents antigravity --skills aif --mcp filesystem', dir);
  const workerFile = path.join(dir, '.agents', 'agents', 'implement-worker.md');
  assert(fs.existsSync(workerFile), 'implement-worker.md must exist');
  fs.appendFileSync(workerFile, '\n# User Custom Instructions\n');

  const out = runCli('update', dir);
  assert(out.includes('Local modifications detected') || out.includes('preserving existing file'));
  assert(fs.readFileSync(workerFile, 'utf8').includes('User Custom Instructions'));
});

// --- SIMULATION 2: Antigravity 2.0 Init -> modify native agent -> update --force preserves modifications
runSim('Antigravity 2.0 Init -> modify native agent -> update --force preserves modification', (dir) => {
  runCli('init --agents antigravity --skills aif --mcp filesystem', dir);
  const workerFile = path.join(dir, '.agents', 'agents', 'implement-worker.md');
  fs.appendFileSync(workerFile, '\n# User Custom Instructions\n');

  const out = runCli('update --force', dir);
  assert(out.includes('--force does not overwrite local agent changes') || out.includes('local changes preserved'));
  assert(fs.readFileSync(workerFile, 'utf8').includes('User Custom Instructions'));
});

// --- SIMULATION 3: Antigravity 2.0 Init -> modify native agent -> deselect Antigravity preserves file
runSim('Antigravity 2.0 Init -> modify native agent -> deselect Antigravity preserves file', (dir) => {
  runCli('init --agents antigravity --skills aif --mcp filesystem', dir);
  const coordFile = path.join(dir, '.agents', 'agents', 'implement-coordinator.md');
  fs.appendFileSync(coordFile, '\n# Custom Coordinator Logic\n');

  const out = runCli('init --agents claude --skills aif', dir);
  assert(out.includes('Preserving modified or untracked native agent file'));
  assert(fs.existsSync(coordFile), 'Modified implement-coordinator.md must remain on disk');
  assert(fs.readFileSync(coordFile, 'utf8').includes('Custom Coordinator Logic'));
});

// --- SIMULATION 4: Antigravity 2.0 Init -> unmodified native agents are cleaned up on deselection
runSim('Antigravity 2.0 Init -> unmodified native agents are cleaned up on deselection', (dir) => {
  runCli('init --agents antigravity --skills aif --mcp filesystem', dir);
  const workerFile = path.join(dir, '.agents', 'agents', 'implement-worker.md');
  assert(fs.existsSync(workerFile));

  runCli('init --agents claude --skills aif', dir);
  assert(!fs.existsSync(workerFile), 'Unmodified implement-worker.md must be deleted on deselection');
});

// --- SIMULATION 5: Antigravity 2.0 Init -> add custom untracked agent -> deselect preserves it
runSim('Antigravity 2.0 Init -> add custom untracked agent -> deselect preserves it', (dir) => {
  runCli('init --agents antigravity --skills aif --mcp filesystem', dir);
  const customAgent = path.join(dir, '.agents', 'agents', 'company-internal-bot.md');
  fs.writeFileSync(customAgent, '# Internal Bot\nNever delete this\n');

  runCli('init --agents claude --skills aif', dir);
  assert(fs.existsSync(customAgent), 'Untracked user agent must be preserved on disk');
  assert(fs.existsSync(path.join(dir, '.agents', 'agents')), '.agents/agents dir must remain');
});

// --- SIMULATION 6: Antigravity 2.0 Init -> add custom rule -> deselect preserves rule and rules dir
runSim('Antigravity 2.0 Init -> add custom rule -> deselect preserves rule and directory', (dir) => {
  runCli('init --agents antigravity --skills aif --mcp filesystem', dir);
  const customRule = path.join(dir, '.agents', 'rules', 'team-coding-standards.md');
  fs.writeFileSync(customRule, '# Team Coding Standards\nAlways use TypeScript\n');

  runCli('init --agents claude --skills aif', dir);
  assert(fs.existsSync(customRule), 'Custom rule must be preserved');
  assert(fs.existsSync(path.join(dir, '.agents', 'rules')), '.agents/rules must be preserved');
});

// --- SIMULATION 7: Antigravity 2.0 Init -> unmodified rules cleaned up bottom-up on deselection
runSim('Antigravity 2.0 Init -> unmodified rules cleaned up bottom-up on deselection', (dir) => {
  runCli('init --agents antigravity --skills aif --mcp filesystem', dir);
  assert(fs.existsSync(path.join(dir, '.agents', 'rules', 'aif-conventions.md')));

  runCli('init --agents claude --skills aif', dir);
  assert(!fs.existsSync(path.join(dir, '.agents', 'rules')), '.agents/rules must be purged bottom-up when empty');
});

// --- SIMULATION 8: Antigravity 2.0 Init -> modify config file -> deselect preserves config file
runSim('Antigravity 2.0 Init -> modify config file -> deselect preserves config file', (dir) => {
  runCli('init --agents antigravity --skills aif --mcp filesystem', dir);
  const mcpConfig = path.join(dir, '.agents', 'mcp_config.json');
  if (fs.existsSync(mcpConfig)) {
    fs.appendFileSync(mcpConfig, '/* custom comment */');
    runCli('init --agents claude --skills aif', dir);
    assert(fs.existsSync(mcpConfig), 'Modified mcp_config.json must be preserved');
  }
});

// --- SIMULATION 9: Conflict prevention: incompatible agent skill targets (Antigravity + Codex app) safely rejected
runSim('Conflict prevention: incompatible agent skill targets (Antigravity + Codex app) safely rejected', (dir) => {
  let threw = false;
  try {
    runCli('init --agents antigravity,codex-app --skills aif --mcp filesystem', dir);
  } catch (err) {
    threw = true;
    const output = (err.stdout?.toString() || '') + (err.stderr?.toString() || '') + err.message;
    assert(output.includes('Incompatible agent skill targets'), 'Must warn about incompatible skill targets');
  }
  assert(threw, 'Should throw on incompatible skill targets');
});

// --- SIMULATION 10: Multi-agent project (Antigravity + Claude) -> modify agent -> re-run init preserves edit
runSim('Multi-agent project (Antigravity + Claude) -> modify agent -> re-run init preserves edit', (dir) => {
  runCli('init --agents antigravity,claude --skills aif --mcp filesystem', dir);
  const workerFile = path.join(dir, '.agents', 'agents', 'implement-worker.md');
  fs.appendFileSync(workerFile, '\n# Persistent Multi-Agent Customization\n');

  runCli('init --agents antigravity,claude --skills aif,aif-plan', dir);
  assert(fs.readFileSync(workerFile, 'utf8').includes('Persistent Multi-Agent Customization'));
});

// --- SIMULATION 11: Real Antigravity 1.0 layout -> upgrade cleanly migrates templated aif.md
runSim('Real Antigravity 1.0 layout -> upgrade cleanly migrates templated aif.md', (dir) => {
  const legacyWf = path.join(dir, '.agent', 'workflows');
  const legacyRules = path.join(dir, '.agent', 'rules');
  fs.mkdirSync(legacyWf, { recursive: true });
  fs.mkdirSync(legacyRules, { recursive: true });

  const renderedAif = renderTemplate(simplifyFrontmatter(AIF_CANONICAL), LEGACY_AG_VARS);
  fs.writeFileSync(path.join(legacyWf, 'aif.md'), renderedAif);
  fs.writeFileSync(path.join(legacyRules, 'aif-conventions.md'), '# Conventions\n');

  fs.writeFileSync(path.join(dir, '.ai-factory.json'), JSON.stringify({
    version: '2.0.0',
    agents: [{ id: 'antigravity', skillsDir: '.agent/skills', installedSkills: ['aif'] }],
    extensions: [],
  }, null, 2));

  const out = runCli('upgrade', dir);
  assert(!fs.existsSync(legacyWf), 'Legacy workflows directory must be purged');
  assert(fs.existsSync(path.join(dir, '.agents', 'skills', 'aif', 'SKILL.md')), 'Modern aif skill must be installed');
});

// --- SIMULATION 12: Antigravity 1.0 with user-modified aif.md -> upgrade preserves it
runSim('Antigravity 1.0 with user-modified aif.md -> upgrade preserves it', (dir) => {
  const legacyWf = path.join(dir, '.agent', 'workflows');
  fs.mkdirSync(legacyWf, { recursive: true });

  const modifiedAif = renderTemplate(simplifyFrontmatter(AIF_CANONICAL), LEGACY_AG_VARS) + '\n# Custom Corporate Flow\n';
  fs.writeFileSync(path.join(legacyWf, 'aif.md'), modifiedAif);

  fs.writeFileSync(path.join(dir, '.ai-factory.json'), JSON.stringify({
    version: '2.0.0',
    agents: [{ id: 'antigravity', skillsDir: '.agent/skills', installedSkills: ['aif'] }],
    extensions: [],
  }, null, 2));

  const out = runCli('upgrade', dir);
  assert(out.includes('Preserving user-modified legacy workflow') || out.includes('aif.md'));
  assert(fs.existsSync(path.join(legacyWf, 'aif.md')), 'Modified aif.md must NOT be deleted');
});

// --- SIMULATION 13: Antigravity 1.0 with custom company workflow -> upgrade preserves it
runSim('Antigravity 1.0 with custom company workflow -> upgrade preserves it', (dir) => {
  const legacyWf = path.join(dir, '.agent', 'workflows');
  fs.mkdirSync(legacyWf, { recursive: true });
  fs.writeFileSync(path.join(legacyWf, 'deploy-to-k8s.md'), '# Deploy to K8s\nkubectl apply -f ...\n');

  fs.writeFileSync(path.join(dir, '.ai-factory.json'), JSON.stringify({
    version: '2.0.0',
    agents: [{ id: 'antigravity', skillsDir: '.agent/skills', installedSkills: [] }],
    extensions: [],
  }, null, 2));

  runCli('upgrade', dir);
  assert(fs.existsSync(path.join(legacyWf, 'deploy-to-k8s.md')), 'Custom company workflow must be preserved');
});

// --- SIMULATION 14: Antigravity 1.0 with custom team rules -> upgrade preserves it
runSim('Antigravity 1.0 with custom team rules -> upgrade preserves it', (dir) => {
  const legacyRules = path.join(dir, '.agent', 'rules');
  fs.mkdirSync(legacyRules, { recursive: true });
  fs.writeFileSync(path.join(legacyRules, 'internal-security.md'), '# Security\nZero trust\n');

  fs.writeFileSync(path.join(dir, '.ai-factory.json'), JSON.stringify({
    version: '2.0.0',
    agents: [{ id: 'antigravity', skillsDir: '.agent/skills', installedSkills: [] }],
    extensions: [],
  }, null, 2));

  runCli('upgrade', dir);
  assert(fs.existsSync(path.join(legacyRules, 'internal-security.md')), 'Custom team rule must be preserved');
});

// --- SIMULATION 15: Claude project with aif-loop -> modify loop agent -> deselect loop preserves edit
runSim('Claude project with aif-loop -> modify loop agent -> deselect loop preserves edit', (dir) => {
  runCli('init --agents claude --skills aif,aif-loop --mcp filesystem', dir);
  const criticFile = path.join(dir, '.claude', 'agents', 'loop-critic.md');
  assert(fs.existsSync(criticFile), 'loop-critic.md must exist');
  fs.appendFileSync(criticFile, '\n# Custom Critic Policy\n');

  const out = runCli('init --agents claude --skills aif', dir);
  assert(out.includes('Preserved modified agent file') || out.includes('loop-critic.md'));
  assert(fs.existsSync(criticFile), 'Modified loop-critic.md must be preserved');
});

// --- SIMULATION 16: Claude project with aif-loop -> pristine loop agents cleanly removed on deselection
runSim('Claude project with aif-loop -> pristine loop agents cleanly removed on deselection', (dir) => {
  runCli('init --agents claude --skills aif,aif-loop --mcp filesystem', dir);
  const criticFile = path.join(dir, '.claude', 'agents', 'loop-critic.md');
  assert(fs.existsSync(criticFile));

  runCli('init --agents claude --skills aif', dir);
  assert(!fs.existsSync(criticFile), 'Pristine loop-critic.md must be cleanly removed');
});

// --- SIMULATION 17: Codex project -> modify native toml agent -> deselect codex preserves edit
runSim('Codex project -> modify native toml agent -> deselect codex preserves edit', (dir) => {
  runCli('init --agents codex --skills aif --mcp filesystem', dir);
  const workerFile = path.join(dir, '.codex', 'agents', 'implement-worker.toml');
  assert(fs.existsSync(workerFile), 'implement-worker.toml must exist');
  fs.appendFileSync(workerFile, '\n# Custom TOML setting\n');

  runCli('init --agents claude --skills aif', dir);
  assert(fs.existsSync(workerFile), 'Modified implement-worker.toml must be preserved on deselection');
});

// --- SIMULATION 18: Claude v1 project with templated bare-name skill -> upgrade cleans old dir
runSim('Claude v1 project with templated bare-name skill -> upgrade cleans old dir', (dir) => {
  const oldSkillDir = path.join(dir, '.claude', 'skills', 'commit');
  fs.mkdirSync(oldSkillDir, { recursive: true });
  const canonicalCommit = fs.readFileSync(path.join(ROOT_DIR, 'skills', 'aif-commit', 'SKILL.md'), 'utf8');
  const renderedCommit = renderTemplate(canonicalCommit, CLAUDE_VARS);
  fs.writeFileSync(path.join(oldSkillDir, 'SKILL.md'), renderedCommit);

  fs.writeFileSync(path.join(dir, '.ai-factory.json'), JSON.stringify({
    version: '2.0.0',
    agents: [{ id: 'claude', skillsDir: '.claude/skills', installedSkills: ['commit'] }],
    extensions: [],
  }, null, 2));

  runCli('upgrade', dir);
  assert(!fs.existsSync(oldSkillDir), 'Clean v1 commit directory must be purged on upgrade');
  assert(fs.existsSync(path.join(dir, '.claude', 'skills', 'aif-commit', 'SKILL.md')), 'Upgraded aif-commit must exist');
});

// --- SIMULATION 19: Claude v1 project with modified skill -> upgrade preserves it
runSim('Claude v1 project with modified skill -> upgrade preserves it', (dir) => {
  const oldSkillDir = path.join(dir, '.claude', 'skills', 'commit');
  fs.mkdirSync(oldSkillDir, { recursive: true });
  const canonicalCommit = fs.readFileSync(path.join(ROOT_DIR, 'skills', 'aif-commit', 'SKILL.md'), 'utf8');
  const modifiedCommit = renderTemplate(canonicalCommit, CLAUDE_VARS) + '\n# Custom User Convention\n';
  fs.writeFileSync(path.join(oldSkillDir, 'SKILL.md'), modifiedCommit);

  fs.writeFileSync(path.join(dir, '.ai-factory.json'), JSON.stringify({
    version: '2.0.0',
    agents: [{ id: 'claude', skillsDir: '.claude/skills', installedSkills: ['commit'] }],
    extensions: [],
  }, null, 2));

  runCli('upgrade', dir);
  assert(fs.existsSync(oldSkillDir), 'Customized v1 commit directory must be preserved');
  assert(fs.readFileSync(path.join(oldSkillDir, 'SKILL.md'), 'utf8').includes('Custom User Convention'));
});

// --- SIMULATION 20: Full cycle: Init -> modify -> deselect -> re-select preserves modifications
runSim('Full cycle: Init -> modify -> deselect -> re-select preserves modifications', (dir) => {
  // Step 1: Init
  runCli('init --agents antigravity --skills aif --mcp filesystem', dir);
  const workerFile = path.join(dir, '.agents', 'agents', 'implement-worker.md');
  fs.appendFileSync(workerFile, '\n# Immortal Customization\n');

  // Step 2: Deselect Antigravity
  runCli('init --agents claude --skills aif', dir);
  assert(fs.existsSync(workerFile), 'File must survive deselection');

  // Step 3: Re-select Antigravity
  runCli('init --agents antigravity --skills aif', dir);
  assert(fs.existsSync(workerFile), 'File must survive re-selection');
  assert(fs.readFileSync(workerFile, 'utf8').includes('Immortal Customization'), 'Customization must remain intact');
});

console.log('='.repeat(70));
console.log(`ALL ${passedCount}/${totalCount} REAL-WORLD USER LIFECYCLE SIMULATIONS PASSED!`);
console.log('='.repeat(70));

cleanSimDir(BASE_SIM_DIR);
