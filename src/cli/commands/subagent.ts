import chalk from 'chalk';
import {
  createDefaultSubagentsConfig,
  loadConfig,
  saveConfig,
  type SubagentProfile,
} from '../../core/config.js';
import {
  getSubagentStatus,
  runImplementOrchestration,
  runPlanScouting,
} from '../../core/subagents.js';

function buildDefaultProfiles(): SubagentProfile[] {
  return [
    {
      id: 'planner-scout',
      role: 'planner-scout',
      description: 'Reads different code areas and returns only planning-relevant facts.',
      maxContextChars: 12000,
      outputFormat: 'markdown',
      enabled: true,
    },
    {
      id: 'implementer-a',
      role: 'implementer',
      description: 'Executes independent implementation tasks in isolated context.',
      maxContextChars: 14000,
      outputFormat: 'markdown',
      enabled: true,
    },
    {
      id: 'implementer-b',
      role: 'implementer',
      description: 'Parallel implementer for independent plan tasks.',
      maxContextChars: 14000,
      outputFormat: 'markdown',
      enabled: true,
    },
    {
      id: 'reviewer',
      role: 'reviewer',
      description: 'Compacts implementation results into merge-ready summary for orchestrator.',
      maxContextChars: 10000,
      outputFormat: 'markdown',
      enabled: true,
    },
  ];
}

export async function subagentInitCommand(): Promise<void> {
  const projectDir = process.cwd();
  const config = await loadConfig(projectDir);
  if (!config) {
    console.log(chalk.red('Error: No .ai-factory.json found.'));
    console.log(chalk.dim('Run "ai-factory init" to set up your project first.'));
    process.exit(1);
  }

  const subagents = createDefaultSubagentsConfig();
  subagents.enabled = true;
  subagents.mode = 'full';
  subagents.maxParallelTasks = 3;
  subagents.profiles = buildDefaultProfiles();
  subagents.routing.plan = ['planner-scout'];
  subagents.routing.implement = ['implementer-a', 'implementer-b'];

  config.subagents = subagents;
  await saveConfig(projectDir, config);

  console.log(chalk.green('✓ Subagents configured (planner + parallel implementers + reviewer)'));
}

export async function subagentListCommand(): Promise<void> {
  const projectDir = process.cwd();
  const config = await loadConfig(projectDir);
  if (!config) {
    console.log(chalk.red('Error: No .ai-factory.json found.'));
    process.exit(1);
  }

  const subagents = config.subagents ?? createDefaultSubagentsConfig();
  console.log(chalk.bold('\nSubagents configuration:\n'));
  console.log(`  enabled: ${subagents.enabled}`);
  console.log(`  mode: ${subagents.mode}`);
  console.log(`  maxParallelTasks: ${subagents.maxParallelTasks}`);
  console.log(`  plan routing: ${subagents.routing.plan.join(', ') || '-'}`);
  console.log(`  implement routing: ${subagents.routing.implement.join(', ') || '-'}`);
  console.log('');

  if (subagents.profiles.length === 0) {
    console.log(chalk.dim('No profiles configured. Run "ai-factory subagent init".'));
    return;
  }

  for (const profile of subagents.profiles) {
    console.log(chalk.bold(`- ${profile.id}`));
    console.log(chalk.dim(`    role: ${profile.role}`));
    console.log(chalk.dim(`    enabled: ${profile.enabled}`));
    console.log(chalk.dim(`    maxContextChars: ${profile.maxContextChars}`));
    console.log(chalk.dim(`    outputFormat: ${profile.outputFormat}`));
  }
  console.log('');
}

export async function subagentStatusCommand(): Promise<void> {
  const projectDir = process.cwd();
  const status = await getSubagentStatus(projectDir);

  console.log(chalk.bold('\nSubagent runs:\n'));
  if (!status.lastRunAt || status.runs.length === 0) {
    console.log(chalk.dim('No runs found yet.'));
    console.log('');
    return;
  }

  console.log(chalk.dim(`Last run: ${status.lastRunAt}\n`));
  for (const run of status.runs.slice(0, 10)) {
    console.log(`- ${run.runId} [${run.mode}] ${run.profileId}`);
    console.log(chalk.dim(`    task: ${run.task}`));
    console.log(chalk.dim(`    status: ${run.status}`));
  }
  console.log('');
}

export async function subagentRunPlanCommand(focus: string): Promise<void> {
  const projectDir = process.cwd();
  const config = await loadConfig(projectDir);
  if (!config) {
    console.log(chalk.red('Error: No .ai-factory.json found.'));
    process.exit(1);
  }

  const subagents = config.subagents ?? createDefaultSubagentsConfig();
  const profileId = subagents.routing.plan[0];
  const result = await runPlanScouting(projectDir, subagents, focus, profileId);

  console.log(chalk.green(`✓ Plan scouting completed by ${result.profileId}`));
  console.log(chalk.dim(`  Run ID: ${result.runId}`));
  console.log(chalk.dim(`  Task: ${result.task}`));
}

export async function subagentRunImplementCommand(): Promise<void> {
  const projectDir = process.cwd();
  const config = await loadConfig(projectDir);
  if (!config) {
    console.log(chalk.red('Error: No .ai-factory.json found.'));
    process.exit(1);
  }

  const subagents = config.subagents ?? createDefaultSubagentsConfig();
  const results = await runImplementOrchestration(projectDir, subagents);
  console.log(chalk.green(`✓ Implement orchestration completed (${results.length} task(s))`));
  for (const run of results) {
    console.log(chalk.dim(`  ${run.profileId} -> ${run.task}`));
  }
}
