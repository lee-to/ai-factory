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
}
