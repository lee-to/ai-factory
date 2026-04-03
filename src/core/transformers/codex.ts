import type { AgentTransformer, TransformResult } from '../transformer.js';
import { rewriteInvocationPrefix } from '../transformer.js';

function toCodexInvocation(content: string): string {
  return rewriteInvocationPrefix(content, invocation => `$${invocation}`);
}

export class CodexTransformer implements AgentTransformer {
  transform(skillName: string, content: string): TransformResult {
    return {
      targetDir: skillName,
      targetName: 'SKILL.md',
      content: toCodexInvocation(content),
      flat: false,
    };
  }

  getWelcomeMessage(): string[] {
    return [
      '1. Open Codex CLI in this directory',
      '2. Run $aif to analyze project and generate project-relevant skills',
    ];
  }

  getInvocationHint(): string {
    return 'Codex CLI: $aif-plan, $aif-commit';
  }
}
