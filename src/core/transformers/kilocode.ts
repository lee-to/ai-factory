import type { AgentTransformer, TransformResult } from '../transformer.js';
import { sanitizeName, extractFrontmatterName, replaceFrontmatterName } from '../transformer.js';

export class KiloCodeTransformer implements AgentTransformer {
  transform(skillName: string, content: string): TransformResult {
    const name = extractFrontmatterName(content);
    const sanitized = name ? sanitizeName(name) : skillName;
    const newContent = name ? replaceFrontmatterName(content, sanitized) : content;

    return {
      targetDir: sanitized,
      targetName: 'SKILL.md',
      content: newContent,
      flat: false,
    };
  }

  getWelcomeMessage(): string[] {
    return [
      '1. Open Kilo Code in this directory',
      '2. Skills installed to .kilocode/skills/ (directory names use hyphens, not dots)',
      '3. MCP servers configured in .kilocode/mcp.json (if selected)',
      '4. Run /aif to analyze project and generate stack-specific skills',
    ];
  }
}
