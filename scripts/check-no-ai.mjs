// Fails when the app depends on, imports or is configured for an AI/ML service.
// Using AI tools while you code is fine; the app itself must not call AI/ML.
// Usage: node scripts/check-no-ai.mjs
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const RULE = 'AI tools may write your code, but the app itself must not call AI/ML.';

const DENIED_PACKAGES = new Set([
  'openai',
  '@google/generative-ai',
  '@google/genai',
  '@google-cloud/vertexai',
  '@google-cloud/aiplatform',
  'langchain',
  'ai', // the Vercel AI SDK
  '@azure/openai',
  'cohere-ai',
  'ollama',
  'replicate',
  'groq-sdk',
  'tiktoken',
  '@xenova/transformers',
  'brain.js',
  'ml5',
  'chromadb',
]);

const DENIED_PREFIXES = [
  '@openai/',
  '@anthropic-ai/',
  '@langchain/',
  '@ai-sdk/',
  '@azure-rest/ai-',
  '@azure/ai-',
  '@huggingface/',
  '@mistralai/',
  '@tensorflow/',
  'onnxruntime-',
  '@pinecone-database/',
];

const DENIED_ENV_PREFIXES = [
  'OPENAI_',
  'ANTHROPIC_',
  'GEMINI_',
  'GOOGLE_GENERATIVE_AI_',
  'AZURE_OPENAI_',
  'MISTRAL_',
  'GROQ_',
  'COHERE_',
  'HUGGINGFACE_',
  'HF_',
];

const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
];

const SOURCE_FILE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const SCANNED_DIRS = ['src', 'prisma'];

export function isDeniedPackage(name) {
  return DENIED_PACKAGES.has(name) || DENIED_PREFIXES.some((prefix) => name.startsWith(prefix));
}

const isDeniedEnvName = (name) => DENIED_ENV_PREFIXES.some((prefix) => name.startsWith(prefix));

/** `@scope/name/sub` → `@scope/name`, `name/sub` → `name`; relative, alias and node: → null. */
export function packageNameOf(specifier) {
  if (/^(\.|\/|@\/|node:|~)/.test(specifier)) return null;
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : (parts[0] ?? null);
}

/** @returns {{ field: string, name: string }[]} */
export function findDeniedDependencies(packageJson) {
  return DEPENDENCY_FIELDS.flatMap((field) =>
    Object.keys(packageJson[field] ?? {})
      .filter(isDeniedPackage)
      .map((name) => ({ field, name }))
  );
}

const IMPORT_PATTERN =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)(['"`])([^'"`]+)\1/g;
const ENV_ACCESS_PATTERN = /(?:process\.env|import\.meta\.env)(?:\.|\[\s*['"`])([A-Za-z0-9_]+)/g;
const ENV_DESTRUCTURE_PATTERN = /\{([^}]*)\}\s*=\s*(?:process\.env|import\.meta\.env)\b/g;

function lineAt(text, index) {
  return text.slice(0, index).split('\n').length;
}

/** @returns {{ line: number, problem: string }[]} */
export function findAiUsageInSource(text) {
  const problems = [];
  for (const match of text.matchAll(IMPORT_PATTERN)) {
    const name = packageNameOf(match[2]);
    if (name && isDeniedPackage(name)) {
      problems.push({ line: lineAt(text, match.index), problem: `imports "${name}"` });
    }
  }
  for (const match of text.matchAll(ENV_ACCESS_PATTERN)) {
    if (isDeniedEnvName(match[1])) {
      problems.push({ line: lineAt(text, match.index), problem: `reads ${match[1]}` });
    }
  }
  for (const match of text.matchAll(ENV_DESTRUCTURE_PATTERN)) {
    for (const name of match[1].match(/[A-Za-z0-9_]+/g) ?? []) {
      if (isDeniedEnvName(name)) {
        problems.push({ line: lineAt(text, match.index), problem: `reads ${name}` });
      }
    }
  }
  return problems.sort((a, b) => a.line - b.line);
}

function listSourceFiles(root) {
  return SCANNED_DIRS.flatMap((dir) => {
    let entries;
    try {
      entries = readdirSync(path.join(root, dir), { recursive: true, withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
    return entries
      .filter((entry) => entry.isFile() && SOURCE_FILE.test(entry.name))
      .map((entry) => path.relative(root, path.join(entry.parentPath, entry.name)))
      .filter((file) => !file.split(path.sep).includes('generated'));
  });
}

/** @returns {string[]} human-readable problems for the whole project */
export function checkProject(root) {
  const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const problems = findDeniedDependencies(packageJson).map(
    ({ field, name }) => `package.json ${field}: "${name}"`
  );
  for (const file of listSourceFiles(root)) {
    for (const { line, problem } of findAiUsageInSource(
      readFileSync(path.join(root, file), 'utf8')
    )) {
      problems.push(`${file}:${line} ${problem}`);
    }
  }
  return problems;
}

function main() {
  const problems = checkProject(process.cwd());
  if (problems.length === 0) {
    console.log('✅ No AI/ML packages, imports or API keys found in the app.');
    return;
  }
  console.error(`❌ ${RULE}\n`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
