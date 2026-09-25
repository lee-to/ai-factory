import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { installSkills, buildManagedSkillsState } from '../dist/core/installer.js';
import {
  AntigravityTransformer,
  LEGACY_GUARDRAILS_CONTENT,
  getGuardrailsRuleContent,
  getConventionsRuleContent,
  simplifyFrontmatter,
  isUnmodifiedPackageWorkflow,
  isUnmodifiedPackageReference,
} from '../dist/core/transformers/antigravity.js';

const ROOT_DIR = path.resolve('.');
const TEST_DIR = path.join(ROOT_DIR, 'temp-test-ag');

const AIF_CANONICAL_CONTENT = fs.readFileSync(path.join(ROOT_DIR, 'skills', 'aif', 'SKILL.md'), 'utf8');
const AIF_PLAN_CANONICAL_CONTENT = fs.readFileSync(path.join(ROOT_DIR, 'skills', 'aif-plan', 'SKILL.md'), 'utf8');
const AIF_PLAN_BODY = AIF_PLAN_CANONICAL_CONTENT.replace(/^---[\s\S]*?---\n?/, '');
const AIF_REVIEW_CANONICAL_CONTENT = fs.readFileSync(path.join(ROOT_DIR, 'skills', 'aif-review', 'SKILL.md'), 'utf8');
const AIF_COMMIT_CANONICAL_CONTENT = fs.readFileSync(path.join(ROOT_DIR, 'skills', 'aif-commit', 'SKILL.md'), 'utf8');
const AIF_IMPLEMENT_CANONICAL_CONTENT = fs.readFileSync(path.join(ROOT_DIR, 'skills', 'aif-implement', 'SKILL.md'), 'utf8');

function safeRmSync(dir) {
  if (fs.existsSync(dir)) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    } catch {
      // Ignore temporary file-lock cleanup errors on Windows
    }
  }
}

const CUSTOM_WORKFLOW_REL = path.join('.agent', 'workflows', 'user-custom-workflow.md');
const CUSTOM_RULE_REL = path.join('.agent', 'rules', 'user-custom-rule.md');
const CUSTOM_SETTINGS_REL = path.join('.agent', 'settings.json');
const CUSTOM_SUBAGENT_REL = path.join('.agents', 'subagents', 'user-custom-agent.md');

const CUSTOM_WORKFLOW_CONTENT = '# User Custom Workflow\nDo not delete\n';
const CUSTOM_RULE_CONTENT = '# User Custom Rule\nDo not delete\n';
const CUSTOM_SETTINGS_CONTENT = '{\n  "customUserSetting": true\n}\n';
const CUSTOM_SUBAGENT_CONTENT = '# User Custom Agent\nDo not delete\n';

function setupCustomUserFiles(baseDir) {
  const workflowPath = path.join(baseDir, CUSTOM_WORKFLOW_REL);
  const rulePath = path.join(baseDir, CUSTOM_RULE_REL);
  const settingsPath = path.join(baseDir, CUSTOM_SETTINGS_REL);
  const subagentPath = path.join(baseDir, CUSTOM_SUBAGENT_REL);

  fs.mkdirSync(path.dirname(workflowPath), { recursive: true });
  fs.mkdirSync(path.dirname(rulePath), { recursive: true });
  fs.mkdirSync(path.dirname(subagentPath), { recursive: true });

  fs.writeFileSync(workflowPath, CUSTOM_WORKFLOW_CONTENT);
  fs.writeFileSync(rulePath, CUSTOM_RULE_CONTENT);
  fs.writeFileSync(settingsPath, CUSTOM_SETTINGS_CONTENT);
  fs.writeFileSync(subagentPath, CUSTOM_SUBAGENT_CONTENT);
}

function assertCustomUserFilesPreserved(baseDir, contextLabel = '') {
  const workflowPath = path.join(baseDir, CUSTOM_WORKFLOW_REL);
  const rulePath = path.join(baseDir, CUSTOM_RULE_REL);
  const settingsPath = path.join(baseDir, CUSTOM_SETTINGS_REL);
  const subagentPath = path.join(baseDir, CUSTOM_SUBAGENT_REL);

  assert(fs.existsSync(workflowPath), `${contextLabel}: .agent/workflows/user-custom-workflow.md must be preserved`);
  assert.strictEqual(fs.readFileSync(workflowPath, 'utf8'), CUSTOM_WORKFLOW_CONTENT, `${contextLabel}: user-custom-workflow.md content mismatch`);

  assert(fs.existsSync(rulePath), `${contextLabel}: .agent/rules/user-custom-rule.md must be preserved`);
  assert.strictEqual(fs.readFileSync(rulePath, 'utf8'), CUSTOM_RULE_CONTENT, `${contextLabel}: user-custom-rule.md content mismatch`);

  assert(fs.existsSync(settingsPath), `${contextLabel}: .agent/settings.json must be preserved`);
  assert.strictEqual(fs.readFileSync(settingsPath, 'utf8'), CUSTOM_SETTINGS_CONTENT, `${contextLabel}: .agent/settings.json content mismatch`);

  assert(fs.existsSync(subagentPath), `${contextLabel}: .agents/subagents/user-custom-agent.md must be preserved`);
  assert.strictEqual(fs.readFileSync(subagentPath, 'utf8'), CUSTOM_SUBAGENT_CONTENT, `${contextLabel}: .agents/subagents/user-custom-agent.md content mismatch`);
}

console.log('--- Running Antigravity 2.0 End-to-End Test ---');

try {
  safeRmSync(TEST_DIR);
  fs.mkdirSync(TEST_DIR, { recursive: true });

  // Pre-create custom user files to verify they survive ai-factory init
  setupCustomUserFiles(TEST_DIR);

  const cliPath = path.join(ROOT_DIR, 'dist', 'cli', 'index.js');
  const initCmd = `node "${cliPath}" init --agents antigravity --skills aif,aif-plan --mcp filesystem`;
  console.log(`Running: ${initCmd} in ${TEST_DIR}`);

  const output = execSync(initCmd, {
    cwd: TEST_DIR,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  console.log(output);

  // 1. Check Skills directory and format
  const aifSkillPath = path.join(TEST_DIR, '.agents', 'skills', 'aif', 'SKILL.md');
  const aifPlanSkillPath = path.join(TEST_DIR, '.agents', 'skills', 'aif-plan', 'SKILL.md');
  assert(fs.existsSync(aifSkillPath), '.agents/skills/aif/SKILL.md must exist');
  assert(fs.existsSync(aifPlanSkillPath), '.agents/skills/aif-plan/SKILL.md must exist');

  const aifContent = fs.readFileSync(aifSkillPath, 'utf8');
  assert(aifContent.startsWith('---\n'), 'SKILL.md must start with frontmatter');
  assert(aifContent.includes('name: aif\n'), 'SKILL.md must preserve name: frontmatter');
  assert(aifContent.includes('description:'), 'SKILL.md must preserve description: frontmatter');

  // 2. Check Rules with triggers
  const guardrailsPath = path.join(TEST_DIR, '.agents', 'rules', 'aif-guardrails.md');
  const conventionsPath = path.join(TEST_DIR, '.agents', 'rules', 'aif-conventions.md');
  assert(fs.existsSync(guardrailsPath), '.agents/rules/aif-guardrails.md must exist');
  assert(fs.existsSync(conventionsPath), '.agents/rules/aif-conventions.md must exist');

  const guardrailsContent = fs.readFileSync(guardrailsPath, 'utf8');
  assert(guardrailsContent.includes('trigger: always_on'), 'Guardrails must have trigger: always_on');
  const conventionsContent = fs.readFileSync(conventionsPath, 'utf8');
  assert(conventionsContent.includes('trigger: model_decision'), 'Conventions must have trigger: model_decision');

  // 3. Check MCP configuration
  const mcpConfigPath = path.join(TEST_DIR, '.agents', 'mcp_config.json');
  assert(fs.existsSync(mcpConfigPath), '.agents/mcp_config.json must exist');
  const mcpJson = JSON.parse(fs.readFileSync(mcpConfigPath, 'utf8'));
  assert(mcpJson.mcpServers, 'mcp_config.json must have root key mcpServers');
  assert(mcpJson.mcpServers.filesystem, 'mcp_config.json must include filesystem server');

  // 4. Check Subagents
  const subagentsDir = path.join(TEST_DIR, '.agents', 'agents');
  assert(fs.existsSync(subagentsDir), '.agents/agents/ must exist');
  const expectedSubagents = [
    'implement-coordinator.md',
    'implement-worker.md',
    'review-sidecar.md',
    'security-sidecar.md',
    'best-practices-sidecar.md',
    'rules-sidecar.md',
    'plan-coordinator.md',
    'plan-polisher.md',
    'commit-preparer.md',
    'docs-auditor.md',
  ];
  for (const subagent of expectedSubagents) {
    const subagentPath = path.join(subagentsDir, subagent);
    assert(fs.existsSync(subagentPath), `Subagent ${subagent} must be installed in .agents/agents/`);
    const content = fs.readFileSync(subagentPath, 'utf8');
    assert(content.includes('subagent: true'), `Subagent ${subagent} must declare subagent: true`);
  }

  // 5. Check .ai-factory.json state
  const configPath = path.join(TEST_DIR, '.ai-factory.json');
  assert(fs.existsSync(configPath), '.ai-factory.json must exist');
  const configJson = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const agAgent = configJson.agents.find(a => a.id === 'antigravity');
  assert(agAgent, 'Antigravity agent must be in config.agents');
  assert.strictEqual(agAgent.skillsDir, '.agents/skills');
  assert.strictEqual(agAgent.agentsDir, '.agents/agents');
  assert(agAgent.installedSkills.includes('aif'));
  assert(agAgent.installedSkills.includes('aif-plan'));
  assert.strictEqual(agAgent.installedAgentFiles.length, 10);
  assert(agAgent.managedAgentFiles['implement-coordinator.md'].sourceHash, 'managedAgentFiles must have sourceHash');
  assert(agAgent.managedAgentFiles['implement-coordinator.md'].installedHash, 'managedAgentFiles must have installedHash');

  // 6. Check that custom user files survived init and AI Factory legacy files were NOT installed in .agent/
  assertCustomUserFilesPreserved(TEST_DIR, 'ai-factory init');
  const legacyWorkflowDir = path.join(TEST_DIR, '.agent', 'workflows');
  assert(!fs.existsSync(path.join(legacyWorkflowDir, 'aif.md')), 'Legacy aif.md must not be installed in .agent/workflows/');
  assert(!fs.existsSync(path.join(legacyWorkflowDir, 'aif-plan.md')), 'Legacy aif-plan.md must not be installed in .agent/workflows/');
  assert(!fs.existsSync(path.join(TEST_DIR, '.agent', 'rules', 'aif-guardrails.md')), 'Legacy aif-guardrails.md must not be installed in .agent/rules/');
  console.log('✓ Custom user files preserved across ai-factory init!');

  // 7. Test ai-factory update (verify custom user files survive)
  console.log('\nTesting: ai-factory update');
  const updateOutput = execSync(`node "${cliPath}" update`, {
    cwd: TEST_DIR,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  console.log(updateOutput);
  assert(updateOutput.includes('[antigravity] Status:'), 'Update output must include [antigravity] Status:');
  assertCustomUserFilesPreserved(TEST_DIR, 'ai-factory update');
  console.log('✓ Custom user files preserved across ai-factory update!');

  // 8. Test ai-factory update --force (verify custom user files survive)
  console.log('\nTesting: ai-factory update --force');
  const forceUpdateOutput = execSync(`node "${cliPath}" update --force`, {
    cwd: TEST_DIR,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  console.log(forceUpdateOutput);
  assert(forceUpdateOutput.includes('Force mode enabled'), 'Force update must show Force mode enabled');
  assertCustomUserFilesPreserved(TEST_DIR, 'ai-factory update --force');
  console.log('✓ Custom user files preserved across ai-factory update --force!');

  // 9. Test upgrading an existing Antigravity 1.0 project (verify legacy deinstallation and purge)
  console.log('\nTesting: ai-factory upgrade from legacy Antigravity 1.0 structure');
  const LEGACY_DIR = path.join(ROOT_DIR, 'temp-test-legacy-ag');
  try {
    safeRmSync(LEGACY_DIR);
    fs.mkdirSync(LEGACY_DIR, { recursive: true });

    // Simulate REAL Antigravity 1.0 layout: flat workflows only, NO .agent/skills/ directories
    const legacyWorkflows = path.join(LEGACY_DIR, '.agent', 'workflows');
    const legacyRules = path.join(LEGACY_DIR, '.agent', 'rules');
    fs.mkdirSync(legacyWorkflows, { recursive: true });
    fs.mkdirSync(legacyRules, { recursive: true });

    // Write simplified-frontmatter workflows (the exact format Antigravity 1.0 produced)
    fs.writeFileSync(path.join(legacyWorkflows, 'aif.md'), simplifyFrontmatter(AIF_CANONICAL_CONTENT));
    fs.writeFileSync(path.join(legacyWorkflows, 'aif-plan.md'), simplifyFrontmatter(AIF_PLAN_CANONICAL_CONTENT));
    fs.writeFileSync(path.join(legacyRules, 'aif-guardrails.md'), LEGACY_GUARDRAILS_CONTENT);

    // Config references .agent/skills which does NOT exist on disk (this is the real 1.0 state)
    const legacyAgent = {
      id: 'antigravity',
      skillsDir: '.agent/skills',
      installedSkills: ['aif', 'aif-plan'],
      mcp: { github: false, filesystem: false, postgres: false, chromeDevtools: false, playwright: false },
    };

    fs.writeFileSync(path.join(LEGACY_DIR, '.ai-factory.json'), JSON.stringify({
      version: '2.0.0',
      agents: [legacyAgent],
      extensions: [],
    }, null, 2));

    const upgradeOutput = execSync(`node "${cliPath}" upgrade`, {
      cwd: LEGACY_DIR,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    console.log(upgradeOutput);

    // Verify legacy .agent/workflows and .agent/rules are completely purged
    assert(!fs.existsSync(legacyWorkflows), 'Legacy .agent/workflows must be completely purged on upgrade');
    assert(!fs.existsSync(legacyRules), 'Legacy .agent/rules must be completely purged on upgrade');

    // Verify modern Antigravity 2.0 structure is installed
    assert(fs.existsSync(path.join(LEGACY_DIR, '.agents', 'skills', 'aif', 'SKILL.md')), 'Modern .agents/skills/aif/SKILL.md must be installed');
    assert(fs.existsSync(path.join(LEGACY_DIR, '.agents', 'agents', 'implement-coordinator.md')), 'Modern .agents/agents/ must be installed');

    // Verify .ai-factory.json migrated skillsDir
    const upgradedConfig = JSON.parse(fs.readFileSync(path.join(LEGACY_DIR, '.ai-factory.json'), 'utf8'));
    const upgradedAg = upgradedConfig.agents.find(a => a.id === 'antigravity');
    assert.strictEqual(upgradedAg.skillsDir, '.agents/skills', 'skillsDir must be migrated to .agents/skills');
    assert.strictEqual(upgradedAg.agentsDir, '.agents/agents', 'agentsDir must be .agents/agents');
    console.log('✓ Legacy Antigravity 1.0 deinstallation and v2 upgrade verified successfully!');
  } finally {
    safeRmSync(LEGACY_DIR);
  }

  // 9b. Test upgrading Antigravity 1.0 project with user-owned files in .agent and .agents
  console.log('\nTesting: ai-factory upgrade preserving user-owned files in .agent and .agents');
  const USER_FILES_DIR = path.join(ROOT_DIR, 'temp-test-user-files-ag');
  try {
    safeRmSync(USER_FILES_DIR);
    fs.mkdirSync(USER_FILES_DIR, { recursive: true });

    // Setup custom user files in all required locations
    setupCustomUserFiles(USER_FILES_DIR);

    const legacyWorkflows = path.join(USER_FILES_DIR, '.agent', 'workflows');
    const legacyRules = path.join(USER_FILES_DIR, '.agent', 'rules');

    // Legacy AI Factory files
    fs.writeFileSync(path.join(legacyWorkflows, 'aif.md'), AIF_CANONICAL_CONTENT);
    fs.writeFileSync(path.join(legacyWorkflows, 'aif-plan.md'), AIF_PLAN_CANONICAL_CONTENT);
    fs.writeFileSync(path.join(legacyWorkflows, 'commit.md'), AIF_COMMIT_CANONICAL_CONTENT);
    fs.writeFileSync(path.join(legacyRules, 'aif-guardrails.md'), LEGACY_GUARDRAILS_CONTENT);
    fs.writeFileSync(path.join(legacyRules, 'aif-conventions.md'), getConventionsRuleContent());

    // Additional user-owned custom files
    fs.writeFileSync(path.join(legacyWorkflows, 'my-custom-flow.md'), '# Custom workflow\n');
    fs.writeFileSync(path.join(legacyRules, 'team.md'), '# Team rules\n');

    await installSkills({
      projectDir: USER_FILES_DIR,
      agentId: 'antigravity',
      skillsDir: '.agent/skills',
      skills: ['aif', 'aif-plan'],
    });

    const legacyAgent = {
      id: 'antigravity',
      skillsDir: '.agent/skills',
      installedSkills: ['aif', 'aif-plan'],
      mcp: { github: false, filesystem: false, postgres: false, chromeDevtools: false, playwright: false },
    };
    legacyAgent.managedSkills = await buildManagedSkillsState(USER_FILES_DIR, legacyAgent, legacyAgent.installedSkills);

    fs.writeFileSync(path.join(USER_FILES_DIR, '.ai-factory.json'), JSON.stringify({
      version: '2.0.0',
      agents: [legacyAgent],
      extensions: [],
    }, null, 2));

    execSync(`node "${cliPath}" upgrade`, {
      cwd: USER_FILES_DIR,
      encoding: 'utf8',
      stdio: 'pipe',
    });

    // Verify legacy AI Factory files were deleted
    assert(!fs.existsSync(path.join(legacyWorkflows, 'aif.md')), 'Legacy aif.md must be deleted');
    assert(!fs.existsSync(path.join(legacyWorkflows, 'aif-plan.md')), 'Legacy aif-plan.md must be deleted');
    assert(!fs.existsSync(path.join(legacyWorkflows, 'commit.md')), 'Legacy commit.md must be deleted');
    assert(!fs.existsSync(path.join(legacyRules, 'aif-guardrails.md')), 'Legacy aif-guardrails.md must be deleted');
    assert(!fs.existsSync(path.join(legacyRules, 'aif-conventions.md')), 'Legacy aif-conventions.md must be deleted');

    // Verify modern Antigravity 2.0 structure installed
    assert(fs.existsSync(path.join(USER_FILES_DIR, '.agents', 'skills', 'aif', 'SKILL.md')), 'Modern aif skill must be installed');
    assert(fs.existsSync(path.join(USER_FILES_DIR, '.agents', 'agents', 'implement-coordinator.md')), 'Modern agents must be installed');
    assert(fs.existsSync(path.join(USER_FILES_DIR, '.agents', 'rules', 'aif-guardrails.md')), 'Modern rules must be installed');

    // Verify user-owned files and parent directories were preserved
    assert(fs.existsSync(path.join(legacyWorkflows, 'user-custom-workflow.md')), 'user-custom-workflow.md must be preserved');
    assert.strictEqual(fs.readFileSync(path.join(legacyWorkflows, 'user-custom-workflow.md'), 'utf8'), CUSTOM_WORKFLOW_CONTENT);
    assert(fs.existsSync(path.join(legacyRules, 'user-custom-rule.md')), 'user-custom-rule.md must be preserved');
    assert.strictEqual(fs.readFileSync(path.join(legacyRules, 'user-custom-rule.md'), 'utf8'), CUSTOM_RULE_CONTENT);
    assert(fs.existsSync(path.join(USER_FILES_DIR, '.agent', 'settings.json')), '.agent/settings.json must be preserved');
    assert.strictEqual(fs.readFileSync(path.join(USER_FILES_DIR, '.agent', 'settings.json'), 'utf8'), CUSTOM_SETTINGS_CONTENT);
    assert(fs.existsSync(path.join(USER_FILES_DIR, '.agents', 'agents', 'user-custom-agent.md')), 'User custom agent must be migrated to .agents/agents');
    assert.strictEqual(fs.readFileSync(path.join(USER_FILES_DIR, '.agents', 'agents', 'user-custom-agent.md'), 'utf8'), CUSTOM_SUBAGENT_CONTENT);
    assert(fs.existsSync(path.join(legacyWorkflows, 'my-custom-flow.md')), 'User-owned my-custom-flow.md must be preserved');
    assert(fs.existsSync(path.join(legacyRules, 'team.md')), 'User-owned team.md must be preserved');
    assert(fs.existsSync(path.join(USER_FILES_DIR, '.agent')), '.agent directory must be preserved when user files exist');

    console.log('✓ Preservation of user-owned files during Antigravity upgrade verified successfully!');
  } finally {
    safeRmSync(USER_FILES_DIR);
  }

  // 10. Test upgrading an existing Antigravity project with legacy .agents/subagents
  console.log('\nTesting: ai-factory upgrade from legacy .agents/subagents layout');
  const SUBAGENTS_MIGRATION_DIR = path.join(ROOT_DIR, 'temp-test-subagents-migration');
  try {
    safeRmSync(SUBAGENTS_MIGRATION_DIR);
    fs.mkdirSync(SUBAGENTS_MIGRATION_DIR, { recursive: true });

    const oldSubagentsDir = path.join(SUBAGENTS_MIGRATION_DIR, '.agents', 'subagents');
    fs.mkdirSync(oldSubagentsDir, { recursive: true });
    fs.writeFileSync(path.join(oldSubagentsDir, 'custom-agent.md'), '---\nname: custom-agent\nsubagent: true\n---\nCustom agent\n');
    const nestedSubDir = path.join(oldSubagentsDir, 'custom-group');
    fs.mkdirSync(nestedSubDir, { recursive: true });
    fs.writeFileSync(path.join(nestedSubDir, 'nested-agent.md'), '---\nname: nested-agent\nsubagent: true\n---\nNested agent\n');

    await installSkills({
      projectDir: SUBAGENTS_MIGRATION_DIR,
      agentId: 'antigravity',
      skillsDir: '.agents/skills',
      skills: ['aif', 'aif-plan'],
    });

    const agSubagentsAgent = {
      id: 'antigravity',
      skillsDir: '.agents/skills',
      agentsDir: '.agents/subagents',
      installedSkills: ['aif', 'aif-plan'],
      installedAgentFiles: ['custom-agent.md'],
      mcp: { github: false, filesystem: false, postgres: false, chromeDevtools: false, playwright: false },
    };
    agSubagentsAgent.managedSkills = await buildManagedSkillsState(SUBAGENTS_MIGRATION_DIR, agSubagentsAgent, agSubagentsAgent.installedSkills);

    fs.writeFileSync(path.join(SUBAGENTS_MIGRATION_DIR, '.ai-factory.json'), JSON.stringify({
      version: '2.18.0',
      agents: [agSubagentsAgent],
      extensions: [],
    }, null, 2));

    const migrationUpgradeOutput = execSync(`node "${cliPath}" upgrade`, {
      cwd: SUBAGENTS_MIGRATION_DIR,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    console.log(migrationUpgradeOutput);

    // Verify .agents/subagents is removed and .agents/agents has files
    assert(!fs.existsSync(oldSubagentsDir), 'Legacy .agents/subagents must be removed after upgrade');
    const newAgentsDir = path.join(SUBAGENTS_MIGRATION_DIR, '.agents', 'agents');
    assert(fs.existsSync(newAgentsDir), '.agents/agents must exist after upgrade');
    assert(fs.existsSync(path.join(newAgentsDir, 'custom-agent.md')), 'Pre-existing custom-agent.md must be migrated to .agents/agents');
    assert(fs.existsSync(path.join(newAgentsDir, 'custom-group', 'nested-agent.md')), 'Pre-existing nested custom agent must be migrated to .agents/agents');
    assert(fs.existsSync(path.join(newAgentsDir, 'implement-coordinator.md')), 'New agents must be installed in .agents/agents');

    const migratedConfig = JSON.parse(fs.readFileSync(path.join(SUBAGENTS_MIGRATION_DIR, '.ai-factory.json'), 'utf8'));
    const migratedAg = migratedConfig.agents.find(a => a.id === 'antigravity');
    assert.strictEqual(migratedAg.agentsDir, '.agents/agents', 'agentsDir must be migrated to .agents/agents in config');
    console.log('✓ Migration from .agents/subagents to .agents/agents verified successfully!');
  } finally {
    safeRmSync(SUBAGENTS_MIGRATION_DIR);
  }

  // 11. Test AntigravityTransformer.cleanupTargetSkills / cleanup ownership-aware behavior directly
  console.log('\nTesting: AntigravityTransformer ownership-aware cleanup');
  const CLEANUP_TEST_DIR = path.join(ROOT_DIR, 'temp-test-cleanup-ag');
  try {
    safeRmSync(CLEANUP_TEST_DIR);
    fs.mkdirSync(CLEANUP_TEST_DIR, { recursive: true });

    const transformer = new AntigravityTransformer();

    const subagentsDir = path.join(CLEANUP_TEST_DIR, '.agents', 'subagents');
    const agentsDir = path.join(CLEANUP_TEST_DIR, '.agents', 'agents');
    const legacyWorkflows = path.join(CLEANUP_TEST_DIR, '.agent', 'workflows');
    const legacyRules = path.join(CLEANUP_TEST_DIR, '.agent', 'rules');

    fs.mkdirSync(subagentsDir, { recursive: true });
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.mkdirSync(legacyWorkflows, { recursive: true });
    fs.mkdirSync(legacyRules, { recursive: true });

    // 1. Subagents: one migratable, one colliding
    fs.writeFileSync(path.join(subagentsDir, 'unique-agent.md'), 'unique content\n');
    fs.writeFileSync(path.join(subagentsDir, 'colliding-agent.md'), 'subagents content\n');
    fs.writeFileSync(path.join(agentsDir, 'colliding-agent.md'), 'agents content\n');

    // 2. Legacy workflows: one known, one user-owned
    fs.writeFileSync(path.join(legacyWorkflows, 'aif-plan.md'), AIF_PLAN_CANONICAL_CONTENT);
    fs.writeFileSync(path.join(legacyWorkflows, 'user-flow.md'), '# User workflow\n');

    // 3. Legacy rules: one known, one user-owned
    fs.writeFileSync(path.join(legacyRules, 'aif-guardrails.md'), LEGACY_GUARDRAILS_CONTENT);
    fs.writeFileSync(path.join(legacyRules, 'team-rules.md'), '# User rule\n');

    // 4. Other user-owned file in .agent/
    fs.writeFileSync(path.join(CLEANUP_TEST_DIR, '.agent', 'notes.txt'), 'User notes\n');

    // Run ownership-aware cleanup
    await transformer.cleanup(CLEANUP_TEST_DIR, '.agents/skills');

    // Assert subagents behavior
    assert(fs.existsSync(path.join(agentsDir, 'unique-agent.md')), 'Unique subagent must be migrated to .agents/agents');
    assert.strictEqual(fs.readFileSync(path.join(agentsDir, 'unique-agent.md'), 'utf8'), 'unique content\n');
    assert(!fs.existsSync(path.join(subagentsDir, 'unique-agent.md')), 'Migrated subagent must be removed from .agents/subagents');
    assert(fs.existsSync(path.join(subagentsDir, 'colliding-agent.md')), 'Colliding subagent must be preserved in .agents/subagents');
    assert.strictEqual(fs.readFileSync(path.join(subagentsDir, 'colliding-agent.md'), 'utf8'), 'subagents content\n');
    assert.strictEqual(fs.readFileSync(path.join(agentsDir, 'colliding-agent.md'), 'utf8'), 'agents content\n', 'Colliding agent in destination must not be overwritten');
    assert(fs.existsSync(subagentsDir), '.agents/subagents must not be removed while preserving colliding files');

    // Assert workflows behavior
    assert(!fs.existsSync(path.join(legacyWorkflows, 'aif-plan.md')), 'Known legacy workflow must be deleted');
    assert(fs.existsSync(path.join(legacyWorkflows, 'user-flow.md')), 'User-owned workflow must be preserved');
    assert(fs.existsSync(legacyWorkflows), '.agent/workflows must not be removed while containing user files');

    // Assert rules behavior
    assert(!fs.existsSync(path.join(legacyRules, 'aif-guardrails.md')), 'Known legacy rule must be deleted');
    assert(fs.existsSync(path.join(legacyRules, 'team-rules.md')), 'User-owned rule must be preserved');
    assert(fs.existsSync(legacyRules), '.agent/rules must not be removed while containing user files');

    // Assert .agent/ behavior
    assert(fs.existsSync(path.join(CLEANUP_TEST_DIR, '.agent', 'notes.txt')), 'User-owned .agent/notes.txt must be preserved');
    assert(fs.existsSync(path.join(CLEANUP_TEST_DIR, '.agent')), '.agent must not be removed while containing user files');

    // Now remove remaining user files and verify full cleanup when directories become completely empty
    fs.unlinkSync(path.join(subagentsDir, 'colliding-agent.md'));
    fs.unlinkSync(path.join(legacyWorkflows, 'user-flow.md'));
    fs.unlinkSync(path.join(legacyRules, 'team-rules.md'));
    fs.unlinkSync(path.join(CLEANUP_TEST_DIR, '.agent', 'notes.txt'));

    await transformer.cleanupTargetSkills(CLEANUP_TEST_DIR, '.agents/skills');

    assert(!fs.existsSync(subagentsDir), '.agents/subagents must be removed when completely empty');
    assert(!fs.existsSync(legacyWorkflows), '.agent/workflows must be removed when completely empty');
    assert(!fs.existsSync(legacyRules), '.agent/rules must be removed when completely empty');
    assert(!fs.existsSync(path.join(CLEANUP_TEST_DIR, '.agent')), '.agent must be removed when completely empty');

    console.log('✓ AntigravityTransformer ownership-aware cleanup verified successfully!');
  } finally {
    safeRmSync(CLEANUP_TEST_DIR);
  }

  // 12. Test subagent migration collision preservation during upgrade
  console.log('\nTesting: subagent migration collision preservation during upgrade');
  const COLLISION_TEST_DIR = path.join(ROOT_DIR, 'temp-test-collision-ag');
  try {
    safeRmSync(COLLISION_TEST_DIR);
    fs.mkdirSync(COLLISION_TEST_DIR, { recursive: true });

    const subagentsDir = path.join(COLLISION_TEST_DIR, '.agents', 'subagents');
    const agentsDir = path.join(COLLISION_TEST_DIR, '.agents', 'agents');
    fs.mkdirSync(subagentsDir, { recursive: true });
    fs.mkdirSync(agentsDir, { recursive: true });

    const subagentContent = '# Subagents Version\n';
    const agentsContent = '# Agents Version\n';

    fs.writeFileSync(path.join(subagentsDir, 'custom.md'), subagentContent);
    fs.writeFileSync(path.join(agentsDir, 'custom.md'), agentsContent);

    // Also include a non-colliding file to verify partial migration
    fs.writeFileSync(path.join(subagentsDir, 'non-colliding.md'), '# Non Colliding\n');

    await installSkills({
      projectDir: COLLISION_TEST_DIR,
      agentId: 'antigravity',
      skillsDir: '.agents/skills',
      skills: ['aif', 'aif-plan'],
    });

    const agCollisionAgent = {
      id: 'antigravity',
      skillsDir: '.agents/skills',
      agentsDir: '.agents/agents',
      installedSkills: ['aif', 'aif-plan'],
      installedAgentFiles: [],
      mcp: { github: false, filesystem: false, postgres: false, chromeDevtools: false, playwright: false },
    };
    agCollisionAgent.managedSkills = await buildManagedSkillsState(COLLISION_TEST_DIR, agCollisionAgent, agCollisionAgent.installedSkills);

    fs.writeFileSync(path.join(COLLISION_TEST_DIR, '.ai-factory.json'), JSON.stringify({
      version: '2.18.0',
      agents: [agCollisionAgent],
      extensions: [],
    }, null, 2));

    execSync(`node "${cliPath}" upgrade`, {
      cwd: COLLISION_TEST_DIR,
      encoding: 'utf8',
      stdio: 'pipe',
    });

    // Destination file must NOT be overwritten
    assert(fs.existsSync(path.join(agentsDir, 'custom.md')), 'Destination custom.md must exist');
    assert.strictEqual(fs.readFileSync(path.join(agentsDir, 'custom.md'), 'utf8'), agentsContent, 'Destination custom.md content must not be overwritten');

    // Conflicting source file must NOT be deleted from .agents/subagents/
    assert(fs.existsSync(path.join(subagentsDir, 'custom.md')), 'Source custom.md must be preserved in .agents/subagents');
    assert.strictEqual(fs.readFileSync(path.join(subagentsDir, 'custom.md'), 'utf8'), subagentContent, 'Source custom.md content must be preserved');

    // Non-colliding file must be migrated
    assert(fs.existsSync(path.join(agentsDir, 'non-colliding.md')), 'Non-colliding file must be migrated to .agents/agents');
    assert(!fs.existsSync(path.join(subagentsDir, 'non-colliding.md')), 'Non-colliding file must be removed from .agents/subagents');

    // .agents/subagents directory must NOT be deleted while containing preserved conflicting file
    assert(fs.existsSync(subagentsDir), '.agents/subagents directory must be preserved on collision');

    console.log('✓ Subagent collision preservation during upgrade verified successfully!');
  } finally {
    safeRmSync(COLLISION_TEST_DIR);
  }

  // 13. Test prefix-named custom workflow preservation during upgrade
  console.log('\nTesting: prefix-named custom workflow preservation during upgrade');
  const PREFIX_TEST_DIR = path.join(ROOT_DIR, 'temp-test-prefix-ag');
  try {
    safeRmSync(PREFIX_TEST_DIR);
    fs.mkdirSync(PREFIX_TEST_DIR, { recursive: true });

    const legacyWorkflows = path.join(PREFIX_TEST_DIR, '.agent', 'workflows');
    fs.mkdirSync(legacyWorkflows, { recursive: true });

    const customWorkflowContent = '# Team Review Workflow\nDo not delete\n';
    fs.writeFileSync(path.join(legacyWorkflows, 'aif-team-review.md'), customWorkflowContent);
    // Known legacy workflow that should be deleted
    fs.writeFileSync(path.join(legacyWorkflows, 'aif-plan.md'), AIF_PLAN_CANONICAL_CONTENT);

    await installSkills({
      projectDir: PREFIX_TEST_DIR,
      agentId: 'antigravity',
      skillsDir: '.agent/skills',
      skills: ['aif', 'aif-plan'],
    });

    const agPrefixAgent = {
      id: 'antigravity',
      skillsDir: '.agent/skills',
      installedSkills: ['aif', 'aif-plan'],
      mcp: { github: false, filesystem: false, postgres: false, chromeDevtools: false, playwright: false },
    };
    agPrefixAgent.managedSkills = await buildManagedSkillsState(PREFIX_TEST_DIR, agPrefixAgent, agPrefixAgent.installedSkills);

    fs.writeFileSync(path.join(PREFIX_TEST_DIR, '.ai-factory.json'), JSON.stringify({
      version: '2.0.0',
      agents: [agPrefixAgent],
      extensions: [],
    }, null, 2));

    execSync(`node "${cliPath}" upgrade`, {
      cwd: PREFIX_TEST_DIR,
      encoding: 'utf8',
      stdio: 'pipe',
    });

    // Known legacy workflow must be deleted
    assert(!fs.existsSync(path.join(legacyWorkflows, 'aif-plan.md')), 'Known legacy aif-plan.md must be deleted');

    // Prefix-named user custom workflow must be preserved
    assert(fs.existsSync(path.join(legacyWorkflows, 'aif-team-review.md')), 'User custom aif-team-review.md must be preserved');
    assert.strictEqual(fs.readFileSync(path.join(legacyWorkflows, 'aif-team-review.md'), 'utf8'), customWorkflowContent);
    assert(fs.existsSync(legacyWorkflows), '.agent/workflows must be preserved while containing user files');
    assert(fs.existsSync(path.join(PREFIX_TEST_DIR, '.agent')), '.agent must be preserved while containing user files');

    console.log('✓ Prefix-named user workflow preservation during upgrade verified successfully!');
  } finally {
    safeRmSync(PREFIX_TEST_DIR);
  }

  // 14. Test pre-existing native agent file and custom rules preservation during init
  console.log('\nTesting: pre-existing native agent file and custom rules preservation during init');
  const PRE_EXISTING_TEST_DIR = path.join(ROOT_DIR, 'temp-test-pre-existing-ag');
  try {
    safeRmSync(PRE_EXISTING_TEST_DIR);
    fs.mkdirSync(PRE_EXISTING_TEST_DIR, { recursive: true });

    const agentsDir = path.join(PRE_EXISTING_TEST_DIR, '.agents', 'agents');
    const rulesDir = path.join(PRE_EXISTING_TEST_DIR, '.agents', 'rules');
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.mkdirSync(rulesDir, { recursive: true });

    const customAgentContent = '---\nname: implement-coordinator\nsubagent: true\n---\n# User Customized Coordinator\nDo not overwrite\n';
    const customRuleContent = '---\ntrigger: always_on\n---\n# User Custom Guardrails\nDo not overwrite\n';

    fs.writeFileSync(path.join(agentsDir, 'implement-coordinator.md'), customAgentContent);
    fs.writeFileSync(path.join(rulesDir, 'aif-guardrails.md'), customRuleContent);

    execSync(`node "${cliPath}" init --agents antigravity --skills aif,aif-plan --mcp filesystem`, {
      cwd: PRE_EXISTING_TEST_DIR,
      encoding: 'utf8',
      stdio: 'pipe',
    });

    // Pre-existing agent file must NOT be overwritten
    assert(fs.existsSync(path.join(agentsDir, 'implement-coordinator.md')), 'implement-coordinator.md must exist');
    assert.strictEqual(fs.readFileSync(path.join(agentsDir, 'implement-coordinator.md'), 'utf8'), customAgentContent, 'User implement-coordinator.md must not be overwritten');

    // Other built-in agent files must still be installed
    assert(fs.existsSync(path.join(agentsDir, 'implement-worker.md')), 'implement-worker.md must be installed');

    // Pre-existing custom rule must NOT be overwritten
    assert(fs.existsSync(path.join(rulesDir, 'aif-guardrails.md')), 'aif-guardrails.md must exist');
    assert.strictEqual(fs.readFileSync(path.join(rulesDir, 'aif-guardrails.md'), 'utf8'), customRuleContent, 'User aif-guardrails.md must not be overwritten');

    // Other default rules should still be installed
    assert(fs.existsSync(path.join(rulesDir, 'aif-conventions.md')), 'aif-conventions.md must be installed');

    // Check .ai-factory.json: implement-coordinator should NOT be in installedAgentFiles
    const config = JSON.parse(fs.readFileSync(path.join(PRE_EXISTING_TEST_DIR, '.ai-factory.json'), 'utf8'));
    const ag = config.agents.find(a => a.id === 'antigravity');
    assert(!ag.installedAgentFiles.includes('implement-coordinator.md'), 'Untracked user agent must not be in installedAgentFiles');
    assert(ag.installedAgentFiles.includes('implement-worker.md'), 'Installed agent must be in installedAgentFiles');

    // Verify that subsequent update and update --force also preserve untracked native agent files and custom rules
    execSync(`node "${cliPath}" update`, {
      cwd: PRE_EXISTING_TEST_DIR,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    assert.strictEqual(fs.readFileSync(path.join(agentsDir, 'implement-coordinator.md'), 'utf8'), customAgentContent, 'User implement-coordinator.md must survive update');
    assert.strictEqual(fs.readFileSync(path.join(rulesDir, 'aif-guardrails.md'), 'utf8'), customRuleContent, 'User aif-guardrails.md must survive update');

    execSync(`node "${cliPath}" update --force`, {
      cwd: PRE_EXISTING_TEST_DIR,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    assert.strictEqual(fs.readFileSync(path.join(agentsDir, 'implement-coordinator.md'), 'utf8'), customAgentContent, 'User implement-coordinator.md must survive update --force');
    assert.strictEqual(fs.readFileSync(path.join(rulesDir, 'aif-guardrails.md'), 'utf8'), customRuleContent, 'User aif-guardrails.md must survive update --force');

    const configAfterForce = JSON.parse(fs.readFileSync(path.join(PRE_EXISTING_TEST_DIR, '.ai-factory.json'), 'utf8'));
    const agAfterForce = configAfterForce.agents.find(a => a.id === 'antigravity');
    assert(!agAfterForce.installedAgentFiles.includes('implement-coordinator.md'), 'Untracked user agent must not be adopted into installedAgentFiles by update --force');

    console.log('✓ Pre-existing native agent file and custom rules preservation during init, update, and update --force verified successfully!');
  } finally {
    safeRmSync(PRE_EXISTING_TEST_DIR);
  }

  // 15. Test local modification preservation in .agents/agents/ during update and update --force
  console.log('\nTesting: local modification preservation in .agents/agents/ during update and update --force');
  const LOCAL_MOD_DIR = path.join(ROOT_DIR, 'temp-test-local-mod-ag');
  try {
    safeRmSync(LOCAL_MOD_DIR);
    fs.mkdirSync(LOCAL_MOD_DIR, { recursive: true });

    // Initialize project with Antigravity 2.0
    execSync(`node "${cliPath}" init --agents antigravity --skills aif,aif-plan --mcp filesystem`, {
      cwd: LOCAL_MOD_DIR,
      encoding: 'utf8',
      stdio: 'pipe',
    });

    const agentsDir = path.join(LOCAL_MOD_DIR, '.agents', 'agents');
    const workerPath = path.join(agentsDir, 'implement-worker.md');
    const coordinatorPath = path.join(agentsDir, 'implement-coordinator.md');

    assert(fs.existsSync(workerPath), 'implement-worker.md must exist after init');
    assert(fs.existsSync(coordinatorPath), 'implement-coordinator.md must exist after init');

    const originalCoordinatorContent = fs.readFileSync(coordinatorPath, 'utf8');
    const customWorkerContent = '# Implement Worker\n// Custom company coordinator instructions\n';

    // Modify .agents/agents/implement-worker.md with custom instructions
    fs.writeFileSync(workerPath, customWorkerContent);
    // Leave .agents/agents/implement-coordinator.md unmodified

    // Run ai-factory update
    const updateOutput = execSync(`node "${cliPath}" update 2>&1`, {
      cwd: LOCAL_MOD_DIR,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    console.log(updateOutput);

    // Assert implement-worker.md retains custom instructions (negative path - not overwritten)
    assert.strictEqual(
      fs.readFileSync(workerPath, 'utf8'),
      customWorkerContent,
      'implement-worker.md must retain custom instructions across update',
    );
    // Assert warning output logged
    assert(
      updateOutput.includes('Local modifications detected in agent file "implement-worker.md"') ||
      updateOutput.includes('implement-worker.md'),
      'Warning output must be logged for modified agent file on update',
    );

    // Run ai-factory update --force
    const forceUpdateOutput = execSync(`node "${cliPath}" update --force 2>&1`, {
      cwd: LOCAL_MOD_DIR,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    console.log(forceUpdateOutput);

    // Assert warning output logged for force update
    assert(
      forceUpdateOutput.includes('--force does not overwrite local agent changes') ||
      forceUpdateOutput.includes('Local modifications detected in agent file "implement-worker.md"'),
      'forceUpdateOutput must contain warning that --force does not overwrite local agent changes',
    );
    assert(
      forceUpdateOutput.includes('implement-worker.md (--force ignored; local changes preserved)') ||
      forceUpdateOutput.includes('implement-worker.md'),
      'forceUpdateOutput must report implement-worker.md as preserved',
    );

    // Assert implement-worker.md STILL retains custom instructions (--force does not overwrite)
    assert.strictEqual(
      fs.readFileSync(workerPath, 'utf8'),
      customWorkerContent,
      'implement-worker.md must STILL retain custom instructions across update --force',
    );
    // Assert implement-coordinator.md exists and is valid (positive path)
    assert(fs.existsSync(coordinatorPath), 'implement-coordinator.md must exist after force update');
    assert.strictEqual(
      fs.readFileSync(coordinatorPath, 'utf8'),
      originalCoordinatorContent,
      'implement-coordinator.md must remain valid across force update',
    );

    // Assert .ai-factory.json has installedAgentFiles and managedAgentFiles containing implement-worker.md and implement-coordinator.md
    const configAfterUpdate = JSON.parse(fs.readFileSync(path.join(LOCAL_MOD_DIR, '.ai-factory.json'), 'utf8'));
    const agAfterUpdate = configAfterUpdate.agents.find(a => a.id === 'antigravity');
    assert(agAfterUpdate, 'antigravity agent must exist in .ai-factory.json');
    assert(
      agAfterUpdate.installedAgentFiles.includes('implement-worker.md'),
      '.ai-factory.json must track modified implement-worker.md in installedAgentFiles',
    );
    assert(
      agAfterUpdate.installedAgentFiles.includes('implement-coordinator.md'),
      '.ai-factory.json must track implement-coordinator.md in installedAgentFiles',
    );
    assert(agAfterUpdate.managedAgentFiles, 'managedAgentFiles must exist in .ai-factory.json');
    assert(
      agAfterUpdate.managedAgentFiles['implement-worker.md'],
      'managedAgentFiles must retain implement-worker.md state across update',
    );
    assert(
      agAfterUpdate.managedAgentFiles['implement-worker.md'].sourceHash,
      'managedAgentFiles implement-worker.md must retain sourceHash',
    );
    assert(
      agAfterUpdate.managedAgentFiles['implement-worker.md'].installedHash,
      'managedAgentFiles implement-worker.md must retain installedHash',
    );
    assert(
      agAfterUpdate.managedAgentFiles['implement-coordinator.md'],
      'managedAgentFiles must retain implement-coordinator.md state across update',
    );
    assert(
      agAfterUpdate.managedAgentFiles['implement-coordinator.md'].sourceHash,
      'managedAgentFiles implement-coordinator.md must retain sourceHash',
    );
    assert(
      agAfterUpdate.managedAgentFiles['implement-coordinator.md'].installedHash,
      'managedAgentFiles implement-coordinator.md must retain installedHash',
    );

    console.log('✓ Local modification preservation in .agents/agents/ verified successfully!');
  } finally {
    safeRmSync(LOCAL_MOD_DIR);
  }

  // 16. Test custom rule preservation during agent deselection / cleanup
  console.log('\nTesting: custom rule preservation during agent deselection / cleanup');
  const DESELECTION_TEST_DIR = path.join(ROOT_DIR, 'temp-test-deselection-ag');
  try {
    safeRmSync(DESELECTION_TEST_DIR);
    fs.mkdirSync(DESELECTION_TEST_DIR, { recursive: true });

    // Initialize project with Antigravity 2.0
    execSync(`node "${cliPath}" init --agents antigravity --skills aif,aif-plan --mcp filesystem`, {
      cwd: DESELECTION_TEST_DIR,
      encoding: 'utf8',
      stdio: 'pipe',
    });

    const rulesDir = path.join(DESELECTION_TEST_DIR, '.agents', 'rules');
    const guardrailsPath = path.join(rulesDir, 'aif-guardrails.md');
    const conventionsPath = path.join(rulesDir, 'aif-conventions.md');

    assert(fs.existsSync(guardrailsPath), 'aif-guardrails.md must exist after init');
    assert(fs.existsSync(conventionsPath), 'aif-conventions.md must exist after init');

    // Modify .agents/rules/aif-guardrails.md with custom axiom
    const customGuardrailContent = '---\ntrigger: always_on\n---\n# Custom Security Policy\n- User custom axiom\n';
    fs.writeFileSync(guardrailsPath, customGuardrailContent);
    // Leave .agents/rules/aif-conventions.md unmodified (matching package template)

    // Trigger deselection / cleanup by selecting Claude Code instead of Antigravity
    const deselectOutput = execSync(`node "${cliPath}" init --agents claude --skills aif 2>&1`, {
      cwd: DESELECTION_TEST_DIR,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    console.log(deselectOutput);

    // Assert notice is logged during agent deselection
    assert(
      deselectOutput.includes('Preserving modified rule') &&
      deselectOutput.includes('aif-guardrails.md'),
      'deselectOutput must contain notice that modified rule is preserved',
    );

    // Assert aif-guardrails.md is preserved on disk (negative path)
    assert(fs.existsSync(guardrailsPath), 'aif-guardrails.md must be preserved on disk after deselection');
    assert.strictEqual(
      fs.readFileSync(guardrailsPath, 'utf8'),
      customGuardrailContent,
      'aif-guardrails.md must retain custom axiom',
    );

    // Assert aif-conventions.md is deleted (positive path)
    assert(!fs.existsSync(conventionsPath), 'Unmodified aif-conventions.md must be deleted after deselection');

    // Assert .agents/rules/ directory is preserved because custom rule remains
    assert(fs.existsSync(rulesDir), '.agents/rules/ directory must be preserved because custom rule remains');


    // Also assert that direct cleanupTargetSkills() respects custom rule preservation
    const transformer = new AntigravityTransformer();
    await transformer.cleanupTargetSkills(DESELECTION_TEST_DIR, '.agents/skills');
    assert(fs.existsSync(guardrailsPath), 'aif-guardrails.md must still be preserved after direct cleanupTargetSkills()');
    assert(fs.existsSync(rulesDir), '.agents/rules/ must still exist after direct cleanupTargetSkills()');

    // When the custom rule is removed, cleanupTargetSkills() should clean up the directory bottom-up
    fs.unlinkSync(guardrailsPath);
    await transformer.cleanupTargetSkills(DESELECTION_TEST_DIR, '.agents/skills');
    assert(!fs.existsSync(rulesDir), '.agents/rules/ directory must be cleanly removed once all custom rules are gone');

    console.log('✓ Custom rule preservation during agent deselection / cleanup verified successfully!');
  } finally {
    safeRmSync(DESELECTION_TEST_DIR);
  }

  // 17. Test user-modified legacy workflow, reference & rule preservation during upgrade
  console.log('\nTesting: user-modified legacy workflow, reference & rule preservation during upgrade');
  const MODIFIED_LEGACY_DIR = path.join(ROOT_DIR, 'temp-test-modified-legacy-ag');
  try {
    safeRmSync(MODIFIED_LEGACY_DIR);
    fs.mkdirSync(MODIFIED_LEGACY_DIR, { recursive: true });

    const legacyWorkflows = path.join(MODIFIED_LEGACY_DIR, '.agent', 'workflows');
    const legacyReferences = path.join(legacyWorkflows, 'references');
    const legacyRules = path.join(MODIFIED_LEGACY_DIR, '.agent', 'rules');
    fs.mkdirSync(legacyReferences, { recursive: true });
    fs.mkdirSync(legacyRules, { recursive: true });

    const customPlanContent = '# Custom Plan Workflow\nUser modifications here\n';
    const customCommitContent = '# Custom Bare Commit Workflow\nUser modifications here\n';
    const customReadmeContent = '# User Reference Notes\nImportant info\n';
    const customConfigContent = '# User customized config template\ncustom_setting: true\n';
    const customGuardrailContent = '# User customized guardrails\nStrict rule\n';

    // User-modified legacy files
    fs.writeFileSync(path.join(legacyWorkflows, 'aif-plan.md'), customPlanContent);
    fs.writeFileSync(path.join(legacyWorkflows, 'commit.md'), customCommitContent);
    fs.writeFileSync(path.join(legacyReferences, 'README.md'), customReadmeContent);
    fs.writeFileSync(path.join(legacyReferences, 'config-template.yaml'), customConfigContent);
    fs.writeFileSync(path.join(legacyRules, 'aif-guardrails.md'), customGuardrailContent);

    // Unmodified package files that SHOULD be deleted
    fs.writeFileSync(path.join(legacyWorkflows, 'aif-review.md'), AIF_REVIEW_CANONICAL_CONTENT);
    fs.writeFileSync(path.join(legacyWorkflows, 'aif.md'), AIF_CANONICAL_CONTENT);
    const unmodifiedUpdateConfig = fs.readFileSync(path.join(ROOT_DIR, 'skills', 'aif', 'references', 'update-config.mjs'), 'utf8');
    fs.writeFileSync(path.join(legacyReferences, 'update-config.mjs'), unmodifiedUpdateConfig);
    fs.writeFileSync(path.join(legacyRules, 'aif-conventions.md'), getConventionsRuleContent());

    await installSkills({
      projectDir: MODIFIED_LEGACY_DIR,
      agentId: 'antigravity',
      skillsDir: '.agent/skills',
      skills: ['aif', 'aif-plan', 'aif-review'],
    });

    const agModifiedAgent = {
      id: 'antigravity',
      skillsDir: '.agent/skills',
      installedSkills: ['aif', 'aif-plan', 'aif-review'],
      mcp: { github: false, filesystem: false, postgres: false, chromeDevtools: false, playwright: false },
    };
    agModifiedAgent.managedSkills = await buildManagedSkillsState(MODIFIED_LEGACY_DIR, agModifiedAgent, agModifiedAgent.installedSkills);

    fs.writeFileSync(path.join(MODIFIED_LEGACY_DIR, '.ai-factory.json'), JSON.stringify({
      version: '2.0.0',
      agents: [agModifiedAgent],
      extensions: [],
    }, null, 2));

    const upgradeOutput = execSync(`node "${cliPath}" upgrade`, {
      cwd: MODIFIED_LEGACY_DIR,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    console.log(upgradeOutput);

    // Assert unmodified aif-review.md and aif-conventions.md are cleanly removed
    assert(!fs.existsSync(path.join(legacyWorkflows, 'aif-review.md')), 'Unmodified aif-review.md must be deleted');
    assert(!fs.existsSync(path.join(legacyWorkflows, 'aif.md')), 'Unmodified aif.md must be deleted');
    assert(!fs.existsSync(path.join(legacyReferences, 'update-config.mjs')), 'Unmodified update-config.mjs must be deleted');
    assert(!fs.existsSync(path.join(legacyRules, 'aif-conventions.md')), 'Unmodified aif-conventions.md must be deleted');

    // Assert modified aif-plan.md, commit.md, references/README.md, and aif-guardrails.md are ALL preserved on disk
    assert(fs.existsSync(path.join(legacyWorkflows, 'aif-plan.md')), 'User-modified aif-plan.md must be preserved');
    assert.strictEqual(fs.readFileSync(path.join(legacyWorkflows, 'aif-plan.md'), 'utf8'), customPlanContent);

    assert(fs.existsSync(path.join(legacyWorkflows, 'commit.md')), 'User-modified commit.md must be preserved');
    assert.strictEqual(fs.readFileSync(path.join(legacyWorkflows, 'commit.md'), 'utf8'), customCommitContent);

    assert(fs.existsSync(path.join(legacyReferences, 'README.md')), 'references/README.md must be preserved');
    assert.strictEqual(fs.readFileSync(path.join(legacyReferences, 'README.md'), 'utf8'), customReadmeContent);

    assert(fs.existsSync(path.join(legacyReferences, 'config-template.yaml')), 'User-modified references/config-template.yaml must be preserved');
    assert.strictEqual(fs.readFileSync(path.join(legacyReferences, 'config-template.yaml'), 'utf8'), customConfigContent);

    assert(fs.existsSync(path.join(legacyRules, 'aif-guardrails.md')), 'User-modified aif-guardrails.md must be preserved');
    assert.strictEqual(fs.readFileSync(path.join(legacyRules, 'aif-guardrails.md'), 'utf8'), customGuardrailContent);

    // Assert warnings logged for preserved files
    assert(upgradeOutput.includes('Preserving user-modified legacy workflow: .agent/workflows/aif-plan.md'), 'Warning for aif-plan.md must be logged');
    assert(upgradeOutput.includes('Preserving user-modified legacy workflow: .agent/workflows/commit.md'), 'Warning for commit.md must be logged');
    assert(upgradeOutput.includes('Preserving legacy reference: .agent/workflows/references/README.md'), 'Warning for references/README.md must be logged');
    assert(upgradeOutput.includes('Preserving user-modified legacy reference: .agent/workflows/references/config-template.yaml'), 'Warning for config-template.yaml must be logged');
    assert(upgradeOutput.includes('Preserving modified legacy rule: .agent/rules/aif-guardrails.md'), 'Warning for aif-guardrails.md must be logged');

    // Assert .agent/ is preserved because custom files remain
    assert(fs.existsSync(legacyReferences), 'references dir must be preserved while containing user files');
    assert(fs.existsSync(legacyWorkflows), '.agent/workflows must be preserved while containing user files');
    assert(fs.existsSync(legacyRules), '.agent/rules must be preserved while containing user files');
    assert(fs.existsSync(path.join(MODIFIED_LEGACY_DIR, '.agent')), '.agent must be preserved while containing user files');

    // Unit test helpers directly
    assert.strictEqual(await isUnmodifiedPackageWorkflow(AIF_PLAN_CANONICAL_CONTENT, 'aif-plan.md'), true);
    assert.strictEqual(await isUnmodifiedPackageWorkflow(AIF_REVIEW_CANONICAL_CONTENT, 'aif-review.md'), true);
    // Bare format without frontmatter matches body
    const bodyOnly = AIF_PLAN_CANONICAL_CONTENT.replace(/^---[\s\S]*?---\n?/, '');
    assert.strictEqual(await isUnmodifiedPackageWorkflow(bodyOnly, 'aif-plan.md'), true);
    assert.strictEqual(await isUnmodifiedPackageWorkflow(customPlanContent, 'aif-plan.md'), false);
    assert.strictEqual(await isUnmodifiedPackageWorkflow(AIF_COMMIT_CANONICAL_CONTENT, 'commit.md'), true);
    assert.strictEqual(await isUnmodifiedPackageWorkflow(customCommitContent, 'commit.md'), false);
    assert.strictEqual(await isUnmodifiedPackageWorkflow(AIF_PLAN_CANONICAL_CONTENT, 'ai-factory-feature.md'), true);
    assert.strictEqual(await isUnmodifiedPackageWorkflow(AIF_IMPLEMENT_CANONICAL_CONTENT, 'ai-factory-task.md'), true);
    assert.strictEqual(await isUnmodifiedPackageWorkflow('anything', 'non-existent-flow.md'), false);

    const unmodifiedConfigTemplate = fs.readFileSync(path.join(ROOT_DIR, 'skills', 'aif', 'references', 'config-template.yaml'), 'utf8');
    assert.strictEqual(await isUnmodifiedPackageReference(unmodifiedConfigTemplate, 'config-template.yaml'), true);
    assert.strictEqual(await isUnmodifiedPackageReference(customReadmeContent, 'README.md'), false);
    assert.strictEqual(await isUnmodifiedPackageReference(unmodifiedUpdateConfig, 'update-config.mjs'), true);
    assert.strictEqual(await isUnmodifiedPackageReference(customConfigContent, 'config-template.yaml'), false);
    assert.strictEqual(await isUnmodifiedPackageReference('custom', 'nonexistent-ref.md'), false);

    console.log('✓ User-modified legacy workflows, references, and rules preservation verified successfully!');
  } finally {
    safeRmSync(MODIFIED_LEGACY_DIR);
  }

  // Test: upgrade does not delete custom skill directory belonging to another agent
  console.log('\nTesting: cross-agent custom skill preservation during upgrade');
  const CLAUDE_CUSTOM_DIR = path.join(ROOT_DIR, 'temp-test-claude-custom-skill');
  try {
    safeRmSync(CLAUDE_CUSTOM_DIR);
    fs.mkdirSync(path.join(CLAUDE_CUSTOM_DIR, '.claude', 'skills', 'qa'), { recursive: true });
    fs.writeFileSync(
      path.join(CLAUDE_CUSTOM_DIR, '.claude', 'skills', 'qa', 'SKILL.md'),
      '# Custom User QA Skill for Claude\n\nDo not delete me.'
    );

    // Set up an unmodified legacy package skill (.claude/skills/plan matching skills/aif-plan)
    const pkgPlanDir = path.join(ROOT_DIR, 'skills', 'aif-plan');
    const claudePlanDir = path.join(CLAUDE_CUSTOM_DIR, '.claude', 'skills', 'plan');
    fs.cpSync(pkgPlanDir, claudePlanDir, {
      recursive: true,
      filter: (src) => !src.split(/[\\/]/).includes('tests'),
    });

    // Set up a skill that has matching SKILL.md but an extra user file in tests/
    const claudeReviewDir = path.join(CLAUDE_CUSTOM_DIR, '.claude', 'skills', 'review');
    fs.cpSync(path.join(ROOT_DIR, 'skills', 'aif-review'), claudeReviewDir, {
      recursive: true,
      filter: (src) => !src.split(/[\\/]/).includes('tests'),
    });
    fs.mkdirSync(path.join(claudeReviewDir, 'tests'), { recursive: true });
    fs.writeFileSync(path.join(claudeReviewDir, 'tests', 'custom-test.sh'), '#!/bin/bash\necho custom test');

    fs.writeFileSync(
      path.join(CLAUDE_CUSTOM_DIR, '.ai-factory.json'),
      JSON.stringify({
        version: '2.0.0',
        agents: [{ id: 'claude', skillsDir: '.claude/skills', installedSkills: [] }],
        extensions: [],
      }, null, 2)
    );

    const upgradeOutput = execSync(`node "${cliPath}" upgrade`, { cwd: CLAUDE_CUSTOM_DIR, encoding: 'utf8', stdio: 'pipe' });

    assert.strictEqual(
      fs.existsSync(path.join(CLAUDE_CUSTOM_DIR, '.claude', 'skills', 'qa', 'SKILL.md')),
      true,
      'Custom Claude skill .claude/skills/qa/ must survive upgrade'
    );
    assert.strictEqual(
      fs.existsSync(path.join(claudeReviewDir, 'tests', 'custom-test.sh')),
      true,
      'Custom user file in .claude/skills/review/tests/ must survive upgrade'
    );
    assert.strictEqual(
      fs.existsSync(claudePlanDir),
      false,
      'Unmodified legacy Claude skill .claude/skills/plan/ must be removed during upgrade'
    );
    assert(
      upgradeOutput.includes('[claude] Preserved custom skill: .claude/skills/qa/'),
      'Output must confirm custom skill preservation'
    );
    assert(
      upgradeOutput.includes('[claude] Preserved custom skill: .claude/skills/review/'),
      'Output must confirm custom skill preservation for tests/ directory'
    );
    assert(
      upgradeOutput.includes('[claude] Removed legacy skill: plan/'),
      'Output must confirm legacy skill removal'
    );
    console.log('✅ Cross-agent custom skill preserved (including tests/ dir) and unmodified legacy skill removed during upgrade');
  } finally {
    safeRmSync(CLAUDE_CUSTOM_DIR);
  }

  console.log('\nTesting: preservation of workflow with modified YAML frontmatter');
  const YAML_MOD_DIR = path.join(ROOT_DIR, 'temp-test-yaml-mod');
  try {
    safeRmSync(YAML_MOD_DIR);
    fs.mkdirSync(path.join(YAML_MOD_DIR, '.agent', 'workflows'), { recursive: true });

    // User changed only description and added a custom YAML field — body is identical to template
    const customYamlWorkflow = `---\ndescription: Custom company planning workflow\ncompany_tag: internal\n---\n\n${AIF_PLAN_BODY}`;
    fs.writeFileSync(path.join(YAML_MOD_DIR, '.agent', 'workflows', 'aif-plan.md'), customYamlWorkflow);
    fs.writeFileSync(path.join(YAML_MOD_DIR, '.ai-factory.json'), JSON.stringify({
      version: '2.0.0',
      agents: [{ id: 'antigravity', skillsDir: '.agent/skills', installedSkills: ['aif-plan'] }],
      extensions: [],
    }, null, 2));

    const upgradeOutput = execSync(`node "${cliPath}" upgrade`, {
      cwd: YAML_MOD_DIR, encoding: 'utf8', stdio: 'pipe',
    });

    // Negative path: modified YAML metadata MUST be preserved
    assert.strictEqual(
      fs.existsSync(path.join(YAML_MOD_DIR, '.agent', 'workflows', 'aif-plan.md')),
      true,
      'Workflow with modified YAML metadata must be preserved on disk during upgrade'
    );
    assert.strictEqual(
      fs.readFileSync(path.join(YAML_MOD_DIR, '.agent', 'workflows', 'aif-plan.md'), 'utf8'),
      customYamlWorkflow,
      'Preserved workflow content must match original custom content exactly'
    );
    assert.ok(
      upgradeOutput.includes('Preserving user-modified legacy workflow') || upgradeOutput.includes('has no verifiable baseline'),
      'Upgrade must log preservation notice for modified workflow'
    );
    console.log('✅ Workflow with modified YAML frontmatter preserved during upgrade');
  } finally {
    safeRmSync(YAML_MOD_DIR);
  }

  console.log('\nTesting: unmodified simplified-frontmatter workflow removed during upgrade');
  const SIMPLIFIED_DIR = path.join(ROOT_DIR, 'temp-test-simplified-wf');
  try {
    safeRmSync(SIMPLIFIED_DIR);
    fs.mkdirSync(path.join(SIMPLIFIED_DIR, '.agent', 'workflows'), { recursive: true });

    // Exact simplified-frontmatter format that Antigravity 1.0 produced
    fs.writeFileSync(
      path.join(SIMPLIFIED_DIR, '.agent', 'workflows', 'aif-plan.md'),
      simplifyFrontmatter(AIF_PLAN_CANONICAL_CONTENT)
    );
    fs.writeFileSync(path.join(SIMPLIFIED_DIR, '.ai-factory.json'), JSON.stringify({
      version: '2.0.0',
      agents: [{ id: 'antigravity', skillsDir: '.agent/skills', installedSkills: ['aif-plan'] }],
      extensions: [],
    }, null, 2));

    execSync(`node "${cliPath}" upgrade`, { cwd: SIMPLIFIED_DIR, encoding: 'utf8', stdio: 'pipe' });

    // Positive path: unmodified legacy workflow MUST be cleaned up / migrated
    assert.strictEqual(
      fs.existsSync(path.join(SIMPLIFIED_DIR, '.agent', 'workflows', 'aif-plan.md')),
      false,
      'Unmodified simplified-frontmatter workflow must be removed during upgrade'
    );
    assert.strictEqual(
      fs.existsSync(path.join(SIMPLIFIED_DIR, '.agents', 'skills', 'aif-plan', 'SKILL.md')),
      true,
      'Unmodified workflow must be migrated to .agents/skills/aif-plan/SKILL.md'
    );
    console.log('✅ Unmodified simplified-frontmatter workflow correctly removed and migrated');
  } finally {
    safeRmSync(SIMPLIFIED_DIR);
  }

  console.log('\n✅ ALL ANTIGRAVITY 2.0 CHECKS PASSED SUCCESSFULLY!\n');
} finally {
  safeRmSync(TEST_DIR);
}
