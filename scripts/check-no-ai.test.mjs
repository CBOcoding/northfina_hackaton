import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  checkProject,
  findAiUsageInSource,
  findDeniedDependencies,
  isDeniedPackage,
  packageNameOf,
} from './check-no-ai.mjs';

describe('isDeniedPackage', () => {
  it.each([
    'openai',
    '@openai/agents',
    '@anthropic-ai/sdk',
    'ai',
    '@ai-sdk/openai',
    '@langchain/core',
    '@azure/ai-inference',
    '@azure-rest/ai-vision-image-analysis',
    '@tensorflow/tfjs',
    'onnxruntime-node',
    '@huggingface/inference',
  ])('denies %s', (name) => {
    expect(isDeniedPackage(name)).toBe(true);
  });

  it.each(['zod', 'next', 'aimless', 'airtable', '@azure/storage-blob', 'tailwindcss'])(
    'allows %s',
    (name) => {
      expect(isDeniedPackage(name)).toBe(false);
    }
  );
});

describe('packageNameOf', () => {
  it('reduces an import specifier to its package name', () => {
    expect(packageNameOf('@anthropic-ai/sdk/resources')).toBe('@anthropic-ai/sdk');
    expect(packageNameOf('openai/helpers/zod')).toBe('openai');
    expect(packageNameOf('./ai')).toBeNull();
    expect(packageNameOf('@/server/ai')).toBeNull();
    expect(packageNameOf('node:fs')).toBeNull();
  });
});

describe('findDeniedDependencies', () => {
  it('finds denied packages in any dependency field', () => {
    expect(
      findDeniedDependencies({
        dependencies: { next: '16.0.0', openai: '1.0.0' },
        devDependencies: { '@ai-sdk/openai': '1.0.0' },
      })
    ).toEqual([
      { field: 'dependencies', name: 'openai' },
      { field: 'devDependencies', name: '@ai-sdk/openai' },
    ]);
  });

  it('is happy with an ordinary package.json', () => {
    expect(findDeniedDependencies({ dependencies: { zod: '4.0.0' } })).toEqual([]);
    expect(findDeniedDependencies({})).toEqual([]);
  });
});

describe('findAiUsageInSource', () => {
  it('finds imports, requires and dynamic imports of denied packages', () => {
    const source = [
      "import OpenAI from 'openai';",
      "import { generateText } from 'ai';",
      "const { Anthropic } = require('@anthropic-ai/sdk');",
      "const lc = await import('@langchain/core');",
      "import './side-effect';",
    ].join('\n');
    expect(findAiUsageInSource(source).map((p) => p.line)).toEqual([1, 2, 3, 4]);
  });

  it('finds AI API keys read from the environment', () => {
    const source = [
      'const a = process.env.OPENAI_API_KEY;',
      "const b = process.env['ANTHROPIC_API_KEY'];",
      'const { HF_TOKEN, DATABASE_URL } = process.env;',
      'const ok = process.env.DATABASE_URL;',
    ].join('\n');
    expect(findAiUsageInSource(source)).toEqual([
      { line: 1, problem: 'reads OPENAI_API_KEY' },
      { line: 2, problem: 'reads ANTHROPIC_API_KEY' },
      { line: 3, problem: 'reads HF_TOKEN' },
    ]);
  });

  it('ignores ordinary code', () => {
    const source = "import { z } from 'zod';\nimport { db } from '@/server/db';\nconst ai = 1;";
    expect(findAiUsageInSource(source)).toEqual([]);
  });
});

describe('checkProject', () => {
  let root;
  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
  });

  function project(files) {
    root = mkdtempSync(path.join(tmpdir(), 'no-ai-'));
    for (const [file, text] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      writeFileSync(path.join(root, file), text);
    }
    return root;
  }

  it('reports dependencies and source files with line numbers', () => {
    const dir = project({
      'package.json': JSON.stringify({ dependencies: { openai: '1.0.0' } }),
      'src/server/chat.ts': "\nimport OpenAI from 'openai';\n",
      'src/generated/prisma/client.ts': "import 'openai';",
    });
    expect(checkProject(dir)).toEqual([
      'package.json dependencies: "openai"',
      `${path.join('src', 'server', 'chat.ts')}:2 imports "openai"`,
    ]);
  });

  it('passes a clean project, even without a prisma folder', () => {
    const dir = project({
      'package.json': JSON.stringify({ dependencies: { zod: '4.0.0' } }),
      'src/index.ts': "import { z } from 'zod';",
    });
    expect(checkProject(dir)).toEqual([]);
  });
});
