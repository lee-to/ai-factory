/**
 * Generic codestyle config detection for any language.
 * Finds checkstyle.xml, .editorconfig, .prettierrc, eslint config, etc.
 */
import path from 'path';
import { fileExists, findFiles } from '../../utils/fs.js';

export interface CodestyleConfig {
  language: string;
  configFiles: CodestyleConfigFile[];
}

export interface CodestyleConfigFile {
  path: string;
  type: string;
  relativePath: string;
}

const CODSTYLE_PATTERNS: Array<{ pattern: (p: string) => boolean; type: string; language: string }> = [
  { pattern: p => path.basename(p) === 'checkstyle.xml' || p.endsWith('checkstyle.xml'), type: 'checkstyle', language: 'java' },
  { pattern: p => path.basename(p) === '.checkstyle.xml', type: 'checkstyle', language: 'java' },
  { pattern: p => path.basename(p) === '.editorconfig', type: 'editorconfig', language: 'any' },
  { pattern: p => /^\.prettierrc(\.(json|js|mjs|cjs|yaml|yml))?$/.test(path.basename(p)), type: 'prettier', language: 'javascript' },
  { pattern: p => path.basename(p) === 'prettier.config.js' || path.basename(p) === 'prettier.config.mjs', type: 'prettier', language: 'javascript' },
  { pattern: p => /^\.eslintrc(\.(json|js|yml|yaml))?$/.test(path.basename(p)) || path.basename(p) === 'eslint.config.js', type: 'eslint', language: 'javascript' },
  { pattern: p => path.basename(p) === '.stylelintrc' || path.basename(p) === 'stylelint.config.js', type: 'stylelint', language: 'css' },
  { pattern: p => path.basename(p) === 'pyproject.toml', type: 'pyproject', language: 'python' },
  { pattern: p => path.basename(p) === '.php-cs-fixer.php' || path.basename(p) === 'php-cs-fixer.php', type: 'php-cs-fixer', language: 'php' },
  { pattern: p => path.basename(p) === 'rustfmt.toml', type: 'rustfmt', language: 'rust' },
  { pattern: p => path.basename(p) === '.golangci.yml' || path.basename(p) === '.golangci.yaml', type: 'golangci', language: 'go' },
];

export async function detectCodestyleConfigs(projectDir: string): Promise<CodestyleConfig[]> {
  const byLanguage = new Map<string, CodestyleConfigFile[]>();

  for (const { pattern, type, language } of CODSTYLE_PATTERNS) {
    const files = await findFiles(projectDir, (_, p) => pattern(p));
    for (const f of files) {
      const rel = path.relative(projectDir, f);
      const entry: CodestyleConfigFile = { path: f, type, relativePath: rel };
      const lang = language === 'any' ? 'common' : language;
      const list = byLanguage.get(lang) ?? [];
      if (!list.some(e => e.relativePath === rel)) {
        list.push(entry);
        byLanguage.set(lang, list);
      }
    }
  }

  return Array.from(byLanguage.entries()).map(([language, configFiles]) => ({
    language,
    configFiles,
  }));
}

export async function findCheckstyleConfig(projectDir: string): Promise<string | null> {
  const candidates = [
    path.join(projectDir, 'config', 'checkstyle', 'checkstyle.xml'),
    path.join(projectDir, 'checkstyle.xml'),
    path.join(projectDir, '.checkstyle.xml'),
  ];
  for (const c of candidates) {
    if (await fileExists(c)) return c;
  }
  const files = await findFiles(projectDir, (_, p) =>
    path.basename(p) === 'checkstyle.xml'
  );
  return files[0] ?? null;
}
