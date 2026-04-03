const SKILL_HINTS: Record<string, string> = {
    'aif': 'Set up AI context',
    'aif-architecture': 'Generate architecture guide',
    'aif-best-practices': 'Clean code guidelines',
    'aif-build-automation': 'Build file automation',
    'aif-ci': 'CI/CD pipeline setup',
    'aif-commit': 'Conventional commit helper',
    'aif-dockerize': 'Docker and Compose setup',
    'aif-docs': 'Docs generation and maintenance',
    'aif-evolve': 'Evolve skills from patches',
    'aif-explore': 'Explore ideas and options',
    'aif-fix': 'Fix specific bugs quickly',
    'aif-grounded': 'Reliability gate (no guesses)',
    'aif-implement': 'Execute current plan tasks',
    'aif-improve': 'Improve existing plan quality',
    'aif-loop': 'Iterative quality refinement loop',
    'aif-plan': 'Plan tasks for feature',
    'aif-reference': 'Create knowledge refs from URLs/docs',
    'aif-review': 'Review staged changes/PR',
    'aif-roadmap': 'Roadmap and milestones',
    'aif-rules': 'Project rules and conventions',
    'aif-security-checklist': 'Security audit checklist',
    'aif-skill-generator': 'Generate new agent skills',
    'aif-verify': 'Verify implementation completeness',
};

const DEFAULT_SKILL_HINT = 'Additional custom skill';
const DEFAULT_HINT_MAX_LENGTH = 44;

function truncateHint(hint: string, maxLength: number): string {
    if (hint.length <= maxLength) {
        return hint;
    }

    const base = hint.slice(0, Math.max(0, maxLength - 3)).trimEnd();
    return `${base}...`;
}

export function getSkillHint(skillId: string): string {
    return SKILL_HINTS[skillId] ?? DEFAULT_SKILL_HINT;
}

export function formatSkillChoiceName(
    skillId: string,
    renderHint: (hint: string) => string,
    maxHintLength: number = DEFAULT_HINT_MAX_LENGTH,
): string {
    const hint = truncateHint(getSkillHint(skillId), maxHintLength);
    return `${skillId} ${renderHint(`- ${hint}`)}`;
}
