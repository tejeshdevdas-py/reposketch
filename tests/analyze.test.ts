import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeRepository } from '../server/analyze.js';
import type { Repository } from '../shared/types.js';

const repo: Repository = {
  owner: 'example',
  name: 'app',
  fullName: 'example/app',
  description: '',
  defaultBranch: 'main',
  commit: 'a'.repeat(40),
  url: 'https://github.com/example/app',
  stars: 0,
};

test('extracts real AST imports, re-exports, require and dynamic imports with source-line evidence', () => {
  const result = analyzeRepository(
    {
      'src/main.ts':
        '// import "./fake"\nimport { x } from "./a.js";\nexport { x } from "./a.js";\nconst a = require("./a.js");\nimport("./a.js");\nconst s = "import(\\\"./fake\\\")";',
      'src/a.ts': 'export const x = 1;',
    },
    repo,
  );
  assert.equal(result.edges.length, 4);
  assert.deepEqual(
    result.edges.map((e) => [e.line, e.kind, e.target]),
    [
      [2, 'import', 'src/a.ts'],
      [3, 'export', 'src/a.ts'],
      [4, 'require', 'src/a.ts'],
      [5, 'dynamic', 'src/a.ts'],
    ],
  );
  assert.equal(result.files[0].url, `https://github.com/example/app/blob/${repo.commit}/src/a.ts`);
});

test('resolves aliases, directory indexes and type-only dependencies without treating packages as files', () => {
  const result = analyzeRepository(
    {
      'tsconfig.json': '{ "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["src/*"] } } }',
      'src/main.tsx':
        'import React from "react";\nimport { value } from "@/utils";\nimport type { Task } from "./types";\nimport "./missing";',
      'src/utils/index.ts': 'export const value = 2;',
      'src/types.ts': 'export interface Task { id: string }',
    },
    repo,
  );
  const main = result.files.find((f) => f.path === 'src/main.tsx')!;
  assert.equal(main.imports[0].external, true);
  assert.equal(main.imports[1].target, 'src/utils/index.ts');
  assert.equal(main.imports[2].typeOnly, true);
  assert.equal(main.imports[3].target, undefined);
  assert.equal(main.imports[3].external, false);
  assert.equal(result.stats.packages, 1);
  assert.equal(result.stats.unresolved, 1);
});

test('keeps cyclic graphs and marks package source and conventional entry candidates', () => {
  const result = analyzeRepository(
    {
      'package.json': '{ "source": "src/boot.ts" }',
      'src/boot.ts': 'import "./other";',
      'src/other.ts': 'import "./boot";',
      'src/main.ts': 'export const x = 1;',
      'node_modules/a/index.ts': 'export const a = 1;',
      'dist/output.js': 'console.log(1);',
      'src/types.d.ts': 'declare const x: number;',
    },
    repo,
  );
  assert.equal(result.files.length, 3);
  assert.equal(result.edges.length, 2);
  assert.match(result.files.find((f) => f.id === 'src/boot.ts')!.entryReason!, /package/);
  assert.match(result.files.find((f) => f.id === 'src/main.ts')!.entryReason!, /conventional/i);
});

test('reports computed imports and unsupported inherited configuration without inventing edges', () => {
  const result = analyzeRepository(
    {
      'tsconfig.json': '{ "extends": "some-config" }',
      'src/main.ts': 'const moduleName = "./other"; import(moduleName);',
      'src/other.ts': 'export const x = 1;',
    },
    repo,
  );
  assert.equal(result.edges.length, 0);
  assert.ok(result.warnings.some((w) => /computed/i.test(w)));
  assert.ok(result.warnings.some((w) => /inherit/i.test(w)));
});

test('does not count import/export specifiers consisting only of types as runtime dependencies', () => {
  const result = analyzeRepository(
    {
      'src/main.ts': 'import { type A } from "./a"; export type { A } from "./a";',
      'src/a.ts': 'export type A = string;',
    },
    repo,
  );
  assert.deepEqual(
    result.edges.map((e) => e.typeOnly),
    [true, true],
  );
});

test('refuses repositories without supported sources', () => {
  assert.throws(() => analyzeRepository({ 'README.md': '# Hello' }, repo), /JavaScript|TypeScript/);
});

test('resolves paths relative to a nested config even without baseUrl', () => {
  const result = analyzeRepository(
    {
      'packages/p/tsconfig.json': '{ "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }',
      'packages/p/src/main.ts': 'import { value } from "@/util";',
      'packages/p/src/util.ts': 'export const value = 1;',
    },
    repo,
  );
  assert.equal(result.edges[0]?.target, 'packages/p/src/util.ts');
});

test('discloses unsupported referenced configs and treats unresolved shorthand aliases as local', () => {
  const result = analyzeRepository(
    {
      'tsconfig.json': '{ "files": [], "references": [{ "path": "./tsconfig.app.json" }] }',
      'tsconfig.app.json': '{ "compilerOptions": { "paths": { "@/*": ["./src/*"] } } }',
      'src/main.ts': 'import { value } from "@/util";',
      'src/util.ts': 'export const value = 1;',
    },
    repo,
  );
  assert.ok(result.warnings.some((w) => /referenced configuration/i.test(w)));
  assert.equal(result.files.find((f) => f.path === 'src/main.ts')?.imports[0].external, false);
});

test('includes import type expressions as type-only dependencies', () => {
  const result = analyzeRepository(
    { 'src/main.ts': 'type T = import("./util").T;', 'src/util.ts': 'export type T = string;' },
    repo,
  );
  assert.equal(result.edges[0]?.target, 'src/util.ts');
  assert.equal(result.edges[0]?.typeOnly, true);
});
