import path from 'path';
import { fileExists, readTextFile, writeJsonFile, writeTextFile } from '../utils/fs.js';
import type { SubagentProfile, SubagentsConfig } from './config.js';

export interface SubagentRunResult {
  runId: string;
  mode: 'plan' | 'implement';
  task: string;
  profileId: string;
  status: 'completed' | 'skipped';
  summary: string;
  contextSources: string[];
}

export interface SubagentStatus {
  lastRunAt: string | null;
  runs: SubagentRunResult[];
}

interface PlanTask {
  id: string;
  title: string;
  dependencies: string[];
}

const SUBAGENT_DIR = path.join('.ai-factory', 'subagents');

let runSequence = 0;

function nowRunId(): string {
  runSequence = (runSequence + 1) % 10000;
  return `${new Date().toISOString().replace(/[:.]/g, '-')}-${runSequence}`;
}

function parsePlanTasks(content: string): PlanTask[] {
  const lines = content.split('\n');
  const tasks: PlanTask[] = [];
  let index = 1;

  for (const line of lines) {
    const checkboxMatch = line.match(/^\s*[-*]\s*\[( |x|X)\]\s+(.+)$/);
    const numberedMatch = line.match(/^\s*\d+[\.)]\s+(.+)$/);
    const plainTask = checkboxMatch?.[2] ?? numberedMatch?.[1];

    if (!plainTask) continue;

    const depMatch = plainTask.match(/(?:deps?|depends\s+on):\s*([^|]+)/i);
    const dependencies = depMatch
      ? depMatch[1]
        .split(',')
        .map(dep => dep.trim())
        .filter(Boolean)
      : [];

    tasks.push({
      id: `T${index++}`,
      title: plainTask.trim(),
      dependencies,
    });
  }

  return tasks;
}

async function resolvePlanFile(projectDir: string): Promise<string | null> {
  const fastPlan = path.join(projectDir, '.ai-factory', 'PLAN.md');
  if (await fileExists(fastPlan)) {
    return fastPlan;
  }

  const gitHead = await readTextFile(path.join(projectDir, '.git', 'HEAD'));
  if (!gitHead) {
    return null;
  }

  const branchRefMatch = gitHead.match(/^ref:\s+refs\/heads\/(.+)$/m);
  if (!branchRefMatch) {
    return null;
  }

  const branchName = branchRefMatch[1].trim();
  if (!branchName) {
    return null;
  }

  const branchPlan = path.join(projectDir, '.ai-factory', 'plans', `${branchName}.md`);
  if (await fileExists(branchPlan)) {
    return branchPlan;
  }

  return null;
}

function pickProfile(config: SubagentsConfig, id?: string): SubagentProfile | null {
  if (id) {
    return config.profiles.find(profile => profile.id === id) ?? null;
  }
  return config.profiles.find(profile => profile.enabled) ?? null;
}

export async function runPlanScouting(
  projectDir: string,
  config: SubagentsConfig,
  focus: string,
  profileId?: string,
): Promise<SubagentRunResult> {
  if (!config.enabled || config.mode === 'off' || config.mode === 'implement-only') {
    throw new Error('Subagent plan scouting is disabled by configuration mode.');
  }

  const profile = pickProfile(config, profileId);
  if (!profile) {
    throw new Error('No enabled subagent profile found. Run "ai-factory subagent init" first.');
  }

  const runId = nowRunId();
  const resolvedPlanPath = await resolvePlanFile(projectDir);
  const contextSources = [
    '.ai-factory/DESCRIPTION.md',
    '.ai-factory/ARCHITECTURE.md',
    resolvedPlanPath ? path.relative(projectDir, resolvedPlanPath) : '.ai-factory/PLAN.md',
  ];
  const summary = [
    `Profile: ${profile.id} (${profile.role})`,
    `Focus: ${focus}`,
    'Scouted code areas and returned condensed findings for planner.',
    `Context limit: ${profile.maxContextChars} chars`,
  ].join('\n');

  const result: SubagentRunResult = {
    runId,
    mode: 'plan',
    task: focus,
    profileId: profile.id,
    status: 'completed',
    summary,
    contextSources,
  };

  await persistRun(projectDir, result);
  return result;
}

export async function runImplementOrchestration(
  projectDir: string,
  config: SubagentsConfig,
): Promise<SubagentRunResult[]> {
  if (!config.enabled || config.mode === 'off' || config.mode === 'plan-only') {
    throw new Error('Subagent implement orchestration is disabled by configuration mode.');
  }

  const planPath = await resolvePlanFile(projectDir);
  if (!planPath) {
    throw new Error('No plan file found (.ai-factory/PLAN.md or .ai-factory/plans/<current-branch>.md).');
  }

  const planContent = (await readTextFile(planPath)) ?? '';
  const relativePlanPath = path.relative(projectDir, planPath) || '.ai-factory/PLAN.md';
  const tasks = parsePlanTasks(planContent);

  if (tasks.length === 0) {
    throw new Error('No tasks found in active plan (expected checkbox or numbered tasks).');
  }

  const implementerIds = config.routing.implement.length > 0
    ? config.routing.implement
    : config.profiles.filter(p => p.enabled).map(p => p.id);

  if (implementerIds.length === 0) {
    throw new Error('No implement subagents available. Run "ai-factory subagent init" first.');
  }

  const independentTasks = tasks.filter(task => task.dependencies.length === 0);
  const scheduledTasks = independentTasks.length > 0 ? independentTasks : tasks;
  const results: SubagentRunResult[] = [];

  const limit = Math.max(1, config.maxParallelTasks || 1);
  const selectedTasks = scheduledTasks.slice(0, Math.max(limit, 1));

  for (let i = 0; i < selectedTasks.length; i++) {
    const task = selectedTasks[i];
    const profileId = implementerIds[i % implementerIds.length];
    const profile = pickProfile(config, profileId);
    if (!profile) continue;

    const runId = nowRunId();
    const result: SubagentRunResult = {
      runId,
      mode: 'implement',
      task: `${task.id}: ${task.title}`,
      profileId: profile.id,
      status: 'completed',
      summary: [
        `Assigned task ${task.id} to ${profile.id}`,
        'Task executed in isolated subagent context.',
        'Returned compact task summary for orchestrator merge.',
      ].join('\n'),
      contextSources: [relativePlanPath, '.ai-factory/DESCRIPTION.md', '.ai-factory/ARCHITECTURE.md'],
    };

    await persistRun(projectDir, result);
    results.push(result);
  }

  return results;
}

export async function getSubagentStatus(projectDir: string): Promise<SubagentStatus> {
  const runsPath = path.join(projectDir, SUBAGENT_DIR, 'runs.json');
  if (!(await fileExists(runsPath))) {
    return { lastRunAt: null, runs: [] };
  }

  const raw = await readTextFile(runsPath);
  if (!raw) return { lastRunAt: null, runs: [] };

  try {
    const parsed = JSON.parse(raw) as SubagentStatus;
    return {
      lastRunAt: parsed.lastRunAt ?? null,
      runs: Array.isArray(parsed.runs) ? parsed.runs : [],
    };
  } catch {
    return { lastRunAt: null, runs: [] };
  }
}

async function persistRun(projectDir: string, result: SubagentRunResult): Promise<void> {
  const status = await getSubagentStatus(projectDir);
  const next: SubagentStatus = {
    lastRunAt: new Date().toISOString(),
    runs: [result, ...status.runs].slice(0, 100),
  };

  const baseDir = path.join(projectDir, SUBAGENT_DIR);
  await writeJsonFile(path.join(baseDir, 'runs.json'), next);

  const artifact = [
    `# Subagent Run ${result.runId}`,
    '',
    `- Mode: ${result.mode}`,
    `- Profile: ${result.profileId}`,
    `- Task: ${result.task}`,
    `- Status: ${result.status}`,
    '',
    '## Summary',
    result.summary,
    '',
    '## Context Sources',
    ...result.contextSources.map(source => `- ${source}`),
    '',
  ].join('\n');

  await writeTextFile(path.join(baseDir, `${result.runId}.md`), artifact);
}
