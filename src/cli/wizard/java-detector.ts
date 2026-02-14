import path from 'path';
import { readTextFile, fileExists, findFiles } from '../../utils/fs.js';
import { findCheckstyleConfig } from './codestyle-detector.js';

export interface JavaCodestyleDetails {
  checkstylePath?: string;
  importOrderGroups?: string[];
  importOrderStaticLast?: boolean;
  basePackage?: string;
  javadocLanguage?: 'en' | 'ru' | 'mixed';
  commentsStyle?: 'javadoc-block' | 'single-line' | 'mixed';
}

export interface JavaProjectDetails {
  buildTool: 'gradle' | 'maven';
  hasLibsVersionsToml: boolean;
  gradleVersion?: string;
  mavenVersion?: string;
  javaVersion?: number;
  jakartaOrJavax: 'jakarta' | 'javax';
  springBoot: boolean;
  configFormat: 'yaml' | 'properties' | 'none';
  grpcProtoPaths: string[];
  grpcMappers: boolean;
  liquibase: boolean;
  liquibaseChangelogPaths: string[];
  flyway: boolean;
  flywayMigrationPaths: string[];
  moduleDescriptions: Record<string, string>;
  dockerComposeDeps: string[];
  dockerBaseImages: string[];
  testFrameworks: string[];
  testCodeStyle?: string;
  codestyle?: JavaCodestyleDetails;
}

export interface JavaDetectedStack {
  name: 'java';
  confidence: 'high';
  frameworks: string[];
  languages: string[];
  java: JavaProjectDetails;
}

export async function detectJavaStack(projectDir: string): Promise<JavaDetectedStack | null> {
  const settingsGradle = path.join(projectDir, 'settings.gradle');
  const buildGradleRoot = path.join(projectDir, 'build.gradle');
  const gradleWrapperProps = path.join(projectDir, 'gradle', 'wrapper', 'gradle-wrapper.properties');
  const pomXml = path.join(projectDir, 'pom.xml');

  const isGradle = await fileExists(settingsGradle) || await fileExists(buildGradleRoot) || await fileExists(gradleWrapperProps);
  const isMaven = await fileExists(pomXml);

  if (!isGradle && !isMaven) {
    return null;
  }

  const buildTool: 'gradle' | 'maven' = isGradle ? 'gradle' : 'maven';
  const details = buildTool === 'gradle'
    ? await analyzeGradleProject(projectDir)
    : await analyzeMavenProject(projectDir);

  const frameworks: string[] = ['java'];
  if (details.springBoot) frameworks.push('spring-boot');
  if (details.grpcProtoPaths.length > 0) frameworks.push('grpc');
  if (details.liquibase) frameworks.push('liquibase');
  if (details.flyway) frameworks.push('flyway');

  return {
    name: 'java',
    confidence: 'high',
    frameworks,
    languages: ['java'],
    java: details,
  };
}

async function analyzeGradleProject(projectDir: string): Promise<JavaProjectDetails> {
  const libsTomlPath = path.join(projectDir, 'gradle', 'libs.versions.toml');
  const hasLibsVersionsToml = await fileExists(libsTomlPath);

  const buildGradleFiles = await findFiles(projectDir, (_, p) =>
    path.basename(p) === 'build.gradle'
  );

  let gradleVersion: string | undefined;
  const gradleWrapperPath = path.join(projectDir, 'gradle', 'wrapper', 'gradle-wrapper.properties');
  const gradleWrapper = await readTextFile(gradleWrapperPath);
  if (gradleWrapper) {
    const distMatch = gradleWrapper.match(/distributionUrl=.*?gradle-(\d+\.\d+(?:\.\d+)?)/);
    if (distMatch) gradleVersion = distMatch[1];
  }

  const allBuildContent = await Promise.all(
    buildGradleFiles.map(f => readTextFile(f))
  ).then(contents => contents.filter(Boolean).join('\n'));

  const libsTomlContent = hasLibsVersionsToml ? await readTextFile(libsTomlPath) : null;

  const javaVersion = extractJavaVersion(allBuildContent);
  const jakartaOrJavax = (javaVersion ?? 8) > 8 ? 'jakarta' : 'javax';

  const springBoot = /spring-boot|libs\.plugins\.boot|alias libs\.plugins\.boot/.test(allBuildContent) ||
    (libsTomlContent?.includes('spring-boot') ?? false);

  const configFormat = await detectConfigFormat(projectDir);

  const protoPaths = await findProtoPaths(projectDir);
  const grpcMappers = /Mapper|GrpcMapper|toProto|fromProto/.test(allBuildContent) ||
    await hasGrpcMappers(projectDir);

  const { liquibase, liquibaseChangelogPaths } = await findLiquibase(projectDir);
  const { flyway, flywayMigrationPaths } = await findFlyway(projectDir);

  const moduleDescriptions = await describeModules(projectDir, buildGradleFiles);

  const dockerComposeDeps = await findDockerComposeDeps(projectDir);
  const dockerBaseImages = await findDockerBaseImages(projectDir, allBuildContent);

  const testFrameworks = extractTestFrameworks(allBuildContent, libsTomlContent);
  const testCodeStyle = await findTestCodeStyle(projectDir);
  const codestyle = await detectJavaCodestyle(projectDir);

  return {
    buildTool: 'gradle',
    hasLibsVersionsToml,
    gradleVersion,
    javaVersion,
    jakartaOrJavax,
    springBoot,
    configFormat,
    grpcProtoPaths: protoPaths,
    grpcMappers,
    liquibase,
    liquibaseChangelogPaths,
    flyway,
    flywayMigrationPaths,
    moduleDescriptions,
    dockerComposeDeps,
    dockerBaseImages,
    testFrameworks,
    testCodeStyle,
    codestyle,
  };
}

async function analyzeMavenProject(projectDir: string): Promise<JavaProjectDetails> {
  const pomPath = path.join(projectDir, 'pom.xml');
  const pomContent = await readTextFile(pomPath) ?? '';

  const javaVersion = extractMavenJavaVersion(pomContent);
  const jakartaOrJavax = (javaVersion ?? 8) > 8 ? 'jakarta' : 'javax';

  const springBoot = /spring-boot-starter|spring-boot-parent/.test(pomContent);

  const configFormat = await detectConfigFormat(projectDir);

  const protoPaths = await findProtoPaths(projectDir);
  const grpcMappers = /grpc|protobuf/.test(pomContent) && await hasGrpcMappers(projectDir);

  const { liquibase, liquibaseChangelogPaths } = await findLiquibase(projectDir);
  const { flyway, flywayMigrationPaths } = await findFlyway(projectDir);

  const buildGradleFiles: string[] = [];
  const moduleDescriptions = await describeModules(projectDir, buildGradleFiles);

  const dockerComposeDeps = await findDockerComposeDeps(projectDir);
  const dockerBaseImages = await findDockerBaseImages(projectDir, pomContent);

  const testFrameworks = extractMavenTestFrameworks(pomContent);
  const testCodeStyle = await findTestCodeStyle(projectDir);
  const codestyle = await detectJavaCodestyle(projectDir);

  return {
    buildTool: 'maven',
    hasLibsVersionsToml: false,
    mavenVersion: extractMavenVersion(pomContent),
    javaVersion,
    jakartaOrJavax,
    springBoot,
    configFormat,
    grpcProtoPaths: protoPaths,
    grpcMappers,
    liquibase,
    liquibaseChangelogPaths,
    flyway,
    flywayMigrationPaths,
    moduleDescriptions,
    dockerComposeDeps,
    dockerBaseImages,
    testFrameworks,
    testCodeStyle,
    codestyle,
  };
}

async function detectJavaCodestyle(projectDir: string): Promise<JavaCodestyleDetails | undefined> {
  const checkstylePath = await findCheckstyleConfig(projectDir);
  const checkstyleContent = checkstylePath ? await readTextFile(checkstylePath) : null;

  const importOrderGroups = extractImportOrderGroups(checkstyleContent);
  const importOrderStaticLast = extractImportOrderStaticLast(checkstyleContent);

  const basePackage = await extractBasePackage(projectDir);
  const javadocLanguage = await detectJavadocLanguage(projectDir);
  const commentsStyle = await detectCommentsStyle(projectDir);

  const hasAny = checkstylePath || (importOrderGroups && importOrderGroups.length > 0) ||
    basePackage || javadocLanguage || commentsStyle;

  if (!hasAny) return undefined;

  return {
    checkstylePath: checkstylePath ? path.relative(projectDir, checkstylePath) : undefined,
    importOrderGroups: importOrderGroups && importOrderGroups.length > 0 ? importOrderGroups : undefined,
    importOrderStaticLast,
    basePackage,
    javadocLanguage,
    commentsStyle,
  };
}

function extractImportOrderGroups(checkstyleContent: string | null): string[] | undefined {
  if (!checkstyleContent) return undefined;
  const match = checkstyleContent.match(/<module\s+name="ImportOrder"[^>]*>[\s\S]*?<property\s+name="groups"\s+value="([^"]+)"/);
  if (!match) return undefined;
  return match[1].split(',').map(g => g.trim());
}

function extractImportOrderStaticLast(checkstyleContent: string | null): boolean | undefined {
  if (!checkstyleContent) return undefined;
  const match = checkstyleContent.match(/<module\s+name="ImportOrder"[^>]*>[\s\S]*?<property\s+name="option"\s+value="(bottom|top)"/);
  if (!match) return undefined;
  return match[1] === 'bottom';
}

async function extractBasePackage(projectDir: string): Promise<string | undefined> {
  const javaFiles = await findFiles(projectDir, (_, p) => p.endsWith('.java') && (p.includes('src/main') || p.includes('src\\main')));
  const packages = new Set<string>();
  for (const f of javaFiles) {
    if (packages.size >= 100) break;
    const content = await readTextFile(f);
    const pkgMatch = content?.match(/^package\s+([\w.]+)\s*;/m);
    if (pkgMatch) packages.add(pkgMatch[1]);
  }
  const pkgList = Array.from(packages);
  if (pkgList.length === 0) return undefined;
  const firstParts = pkgList[0].split('.');
  let commonLen = firstParts.length;
  for (const pkg of pkgList.slice(1)) {
    const parts = pkg.split('.');
    let i = 0;
    while (i < commonLen && i < parts.length && parts[i] === firstParts[i]) i++;
    commonLen = Math.min(commonLen, i);
  }
  const base = firstParts.slice(0, commonLen).join('.');
  return base && commonLen >= 2 ? base : undefined;
}

async function detectJavadocLanguage(projectDir: string): Promise<'en' | 'ru' | 'mixed' | undefined> {
  const javaFiles = await findFiles(projectDir, (_, p) => p.endsWith('.java'));
  const cyrillic = /[\u0400-\u04FF]/;
  let enCount = 0;
  let ruCount = 0;
  for (const f of javaFiles.slice(0, 30)) {
    const content = await readTextFile(f);
    const javadocs = content?.match(/\/\*\*[\s\S]*?\*\//g) ?? [];
    for (const jd of javadocs) {
      const text = jd.replace(/@\w+/g, '').replace(/\*\//g, '');
      if (cyrillic.test(text)) ruCount++;
      else if (/\b(the|a|an|is|are|for|and|or|returns|param|throws|deprecated)\b/i.test(text)) enCount++;
    }
  }
  if (ruCount > 0 && enCount === 0) return 'ru';
  if (enCount > 0 && ruCount === 0) return 'en';
  if (ruCount > 0 && enCount > 0) return 'mixed';
  return undefined;
}

async function detectCommentsStyle(projectDir: string): Promise<'javadoc-block' | 'single-line' | 'mixed' | undefined> {
  const sep = path.sep;
  const javaFiles = await findFiles(projectDir, (_, p) =>
    p.endsWith('.java') && (p.includes('src' + sep + 'main') || p.includes('src/main'))
  );
  let javadocFiles = 0;
  let singleLineFiles = 0;
  for (const f of javaFiles.slice(0, 30)) {
    const content = await readTextFile(f);
    if (!content) continue;
    const hasJavadoc = /\/\*\*[\s\S]*?\*\//.test(content);
    const hasSlComment = /\/\/[^\n]+/.test(content) && !content.includes('// http');
    if (hasJavadoc) javadocFiles++;
    if (hasSlComment) singleLineFiles++;
  }
  if (javadocFiles > 0 && singleLineFiles === 0) return 'javadoc-block';
  if (singleLineFiles > 0 && javadocFiles === 0) return 'single-line';
  if (javadocFiles > 0 && singleLineFiles > 0) return 'mixed';
  return undefined;
}

function extractJavaVersion(buildContent: string): number | undefined {
  const toolchainMatch = buildContent.match(/JavaLanguageVersion\.of\((\d+)\)/);
  if (toolchainMatch) return parseInt(toolchainMatch[1], 10);
  const compatMatch = buildContent.match(/sourceCompatibility\s*=\s*['"]?(\d+)/);
  if (compatMatch) return parseInt(compatMatch[1], 10);
  const javaMatch = buildContent.match(/java\s*\{\s*toolchain[^}]*languageVersion\s*=\s*JavaLanguageVersion\.of\((\d+)\)/s);
  if (javaMatch) return parseInt(javaMatch[1], 10);
  return undefined;
}

function extractMavenJavaVersion(pomContent: string): number | undefined {
  const mavenMatch = pomContent.match(/<maven\.compiler\.(?:source|release)>(\d+)<\/maven\.compiler\.(?:source|release)>/);
  if (mavenMatch) return parseInt(mavenMatch[1], 10);
  const javaMatch = pomContent.match(/<java\.version>(\d+)<\/java\.version>/);
  if (javaMatch) return parseInt(javaMatch[1], 10);
  return undefined;
}

function extractMavenVersion(pomContent: string): string | undefined {
  const match = pomContent.match(/<modelVersion>([^<]+)<\/modelVersion>/);
  return match?.[1];
}

async function detectConfigFormat(projectDir: string): Promise<'yaml' | 'properties' | 'none'> {
  const appYaml = await findFiles(projectDir, (_, p) =>
    path.basename(p) === 'application.yml' || path.basename(p) === 'application.yaml'
  );
  const appProps = await findFiles(projectDir, (_, p) =>
    path.basename(p) === 'application.properties'
  );
  if (appYaml.length > 0) return 'yaml';
  if (appProps.length > 0) return 'properties';
  return 'none';
}

async function findProtoPaths(projectDir: string): Promise<string[]> {
  const protoFiles = await findFiles(projectDir, (_, p) => p.endsWith('.proto'));
  if (protoFiles.length === 0) return [];
  const dirs = protoFiles.map(f => path.dirname(f));
  const firstParts = dirs[0].split(path.sep);
  let commonLen = firstParts.length;
  for (const d of dirs.slice(1)) {
    const parts = d.split(path.sep);
    let i = 0;
    while (i < commonLen && i < parts.length && parts[i] === firstParts[i]) i++;
    commonLen = Math.min(commonLen, i);
  }
  const commonRoot = firstParts.slice(0, commonLen).join(path.sep);
  const rel = path.relative(projectDir, commonRoot);
  return rel ? [rel] : [];
}

async function hasGrpcMappers(projectDir: string): Promise<boolean> {
  const javaFiles = await findFiles(projectDir, (_, p) => p.endsWith('.java'));
  for (const f of javaFiles) {
    const content = await readTextFile(f);
    if (content && (/Mapper|toProto|fromProto|GrpcMapper/.test(content))) {
      return true;
    }
  }
  return false;
}

async function findLiquibase(projectDir: string): Promise<{ liquibase: boolean; liquibaseChangelogPaths: string[] }> {
  const changelogFiles = await findFiles(projectDir, (_, p) =>
    path.basename(p).startsWith('db.changelog') || p.includes('db/changelog')
  );
  const paths = changelogFiles
    .map(f => path.relative(projectDir, path.dirname(f)))
    .filter(p => p && !p.includes('bin' + path.sep) && !p.includes('bin/'));
  const unique = [...new Set(paths)].sort();
  return { liquibase: unique.length > 0, liquibaseChangelogPaths: unique };
}

async function findFlyway(projectDir: string): Promise<{ flyway: boolean; flywayMigrationPaths: string[] }> {
  const sqlFiles = await findFiles(projectDir, (_, p) =>
    /V\d+__.*\.sql|V\d+\.\d+__.*\.sql/.test(path.basename(p))
  );
  const dirs = sqlFiles.map(f => path.relative(projectDir, path.dirname(f))).filter(Boolean);
  const unique = [...new Set(dirs)].sort();
  return { flyway: unique.length > 0, flywayMigrationPaths: unique };
}

async function describeModules(projectDir: string, buildGradleFiles: string[]): Promise<Record<string, string>> {
  const desc: Record<string, string> = {};
  for (const bf of buildGradleFiles) {
    const content = await readTextFile(bf);
    if (!content) continue;
    const moduleDir = path.relative(projectDir, path.dirname(bf));
    const moduleName = moduleDir || 'root';
    const hints: string[] = [];
    if (/grpc-api|grpc\.protobuf|protobuf/.test(content)) hints.push('grpc-api');
    if (/common|starter\.base/.test(content) && !/grpc-api/.test(content)) hints.push('common');
    if (/starter\.web|spring-boot-starter-web/.test(content)) hints.push('http-api');
    if (/gateway|spring-cloud-gateway/.test(content)) hints.push('gateway');
    if (/spring-grpc|grpc\.protobuf/.test(content) && /starter\.web/.test(content)) hints.push('grpc+http');
    if (/test-common|e2e-tests/.test(content)) hints.push('test');
    if (hints.length > 0) desc[moduleName] = hints.join(', ');
  }
  return desc;
}

async function findDockerComposeDeps(projectDir: string): Promise<string[]> {
  const composeFiles = await findFiles(projectDir, (_, p) =>
    path.basename(p) === 'docker-compose.yml' || path.basename(p) === 'docker-compose.yaml'
  );
  const deps: string[] = [];
  for (const f of composeFiles) {
    const content = await readTextFile(f);
    if (!content) continue;
    const imageMatch = content.matchAll(/image:\s*([^\s#\n]+)/g);
    for (const m of imageMatch) {
      const img = m[1].toLowerCase();
      if (img.includes('postgres')) deps.push('postgres');
      else if (img.includes('mysql')) deps.push('mysql');
      else if (img.includes('nats')) deps.push('nats');
      else if (img.includes('redis')) deps.push('redis');
      else if (img.includes('elasticsearch') || img.includes('elk')) deps.push('ELK');
      else if (img.includes('clickhouse')) deps.push('clickhouse');
      else if (img.includes('kafka')) deps.push('kafka');
      else if (img.includes('mongodb')) deps.push('mongodb');
    }
  }
  return [...new Set(deps)];
}

async function findDockerBaseImages(projectDir: string, buildContent: string): Promise<string[]> {
  const images: string[] = [];
  const jibMatch = buildContent.matchAll(/image\s*=\s*["']([^"']+)["']|from\s*\{\s*image\s*=\s*["']([^"']+)["']/g);
  for (const m of jibMatch) {
    const img = (m[1] ?? m[2])?.trim();
    if (img && !img.includes('${') && !/^FROM$|^\$/.test(img)) images.push(img);
  }
  const baseImageMatch = buildContent.match(/baseImage\s*=\s*["']([^"']+)["']/);
  if (baseImageMatch && !baseImageMatch[1].includes('${')) images.push(baseImageMatch[1]);
  const dockerfiles = await findFiles(projectDir, (_, p) =>
    path.basename(p) === 'Dockerfile' || path.basename(p).startsWith('Dockerfile.')
  );
  for (const df of dockerfiles) {
    const content = await readTextFile(df);
    const fromMatch = content?.match(/FROM\s+([^\s\\]+)/);
    if (fromMatch && !fromMatch[1].startsWith('$')) images.push(fromMatch[1]);
  }
  return [...new Set(images)].filter(img => img.length > 3 && !/^[A-Z_]+$/.test(img));
}

function extractTestFrameworks(buildContent: string, libsToml: string | null): string[] {
  const frameworks: string[] = [];
  if (/junit|junit-jupiter|libs\.junit/.test(buildContent) || libsToml?.includes('junit')) frameworks.push('junit-jupiter');
  if (/mockito|libs\.mockito/.test(buildContent) || libsToml?.includes('mockito')) frameworks.push('mockito');
  if (/testcontainers|libs\.testcontainers/.test(buildContent) || libsToml?.includes('testcontainers')) frameworks.push('testcontainers');
  if (/rest-assured|libs\.rest\.assured/.test(buildContent)) frameworks.push('rest-assured');
  if (/cucumber|libs\.cucumber/.test(buildContent)) frameworks.push('cucumber');
  if (/useJUnitPlatform/.test(buildContent)) frameworks.push('junit-jupiter');
  return [...new Set(frameworks)];
}

function extractMavenTestFrameworks(pomContent: string): string[] {
  const frameworks: string[] = [];
  if (/junit-jupiter|junit\.jupiter/.test(pomContent)) frameworks.push('junit-jupiter');
  if (/mockito/.test(pomContent)) frameworks.push('mockito');
  if (/testcontainers/.test(pomContent)) frameworks.push('testcontainers');
  return [...new Set(frameworks)];
}

async function findTestCodeStyle(projectDir: string): Promise<string | undefined> {
  const sep = path.sep;
  const testFiles = await findFiles(projectDir, (_, p) =>
    /Test\.java$|Tests\.java$/.test(p) && (p.includes('src' + sep + 'test') || p.includes('src/test'))
  );
  for (const f of testFiles.slice(0, 10)) {
    const content = await readTextFile(f);
    if (!content) continue;
    const style: string[] = [];
    if (/@DisplayName\s*\(/.test(content)) style.push('@DisplayName');
    if (/@ParameterizedTest|@CsvSource|@MethodSource/.test(content)) style.push('parameterized');
    if (/\/\*\*[\s\S]*?\*\//.test(content) && /@(Test|DisplayName|BeforeEach|AfterEach)/.test(content)) style.push('javadocs');
    if (/@BeforeEach|@AfterEach|@BeforeAll|@AfterAll/.test(content)) style.push('lifecycle');
    if (/@Nested/.test(content)) style.push('@Nested');
    if (style.length > 0) return [...new Set(style)].join(', ');
  }
  return undefined;
}
