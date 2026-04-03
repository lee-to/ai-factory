import type { AgentTransformer, TransformResult } from '../transformer.js';

export class DefaultTransformer implements AgentTransformer {
  transform(skillName: string, content: string): TransformResult {
    return {
      targetDir: skillName,
      targetName: 'SKILL.md',
      content,
      flat: false,
    };
  }

  getWelcomeMessage(): string[] {
    return [
      '1. Open the agent in this directory',
      '2. Run /aif to analyze project and generate project-relevant skills',
    ];
  }
}
