import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeRepository } from '../server/analyze.js';
import { demo } from '../server/demo.js';
import { analyzeImpact, highlightImpact } from '../src/impact.js';

const graph = analyzeRepository(
  {
    'root.ts': 'export const value = 1;',
    'direct.ts': 'import {value} from "./root";\nexport {value} from "./root";',
    'indirect.ts': 'import "./direct";',
    'types.ts': 'import type {value} from "./root";',
    'type-user.ts': 'import "./types";',
    'unrelated.ts': 'export const other = 1;',
  },
  demo.repository,
);

test('finds reverse dependents once and retains a source-backed shortest path', () => {
  const impact = analyzeImpact(graph, 'root.ts', false);
  assert.equal(impact.direct, 1);
  assert.equal(impact.indirect, 1);
  assert.deepEqual([...impact.paths.keys()], ['direct.ts', 'indirect.ts']);
  assert.deepEqual(
    impact.paths.get('indirect.ts')!.map((e) => [e.source, e.target, e.line]),
    [
      ['indirect.ts', 'direct.ts', 1],
      ['direct.ts', 'root.ts', 1],
    ],
  );
  assert.equal(analyzeImpact(graph, 'indirect.ts', false).paths.size, 0);
});

test('includes type-only chains only when requested', () => {
  const impact = analyzeImpact(graph, 'root.ts', true);
  assert.equal(impact.direct, 2);
  assert.equal(impact.indirect, 2);
  assert.equal(impact.paths.get('type-user.ts')!.at(-1)!.typeOnly, true);
});

test('cycles, diamonds, and self-imports do not count the root or duplicate dependents', () => {
  const cyclic = analyzeRepository(
    {
      'a.ts': 'import "./b"; import "./a";',
      'b.ts': 'import "./a";',
      'c.ts': 'import "./a"; import "./b";',
      'd.ts': 'import "./c"; import "./a";',
    },
    demo.repository,
  );
  const impact = analyzeImpact(cyclic, 'a.ts', false);
  assert.equal(impact.direct, 3);
  assert.equal(impact.indirect, 0);
  assert.equal(impact.paths.has('a.ts'), false);
  assert.equal(impact.paths.get('d.ts')!.length, 1);
  assert.equal(analyzeImpact(cyclic, 'missing.ts', false).paths.size, 0);
});

test('highlights cards, bound labels, and relevant arrows without modifying the edited scene', () => {
  const impact = analyzeImpact(graph, 'root.ts', false);
  const card = (id: string, path: string) => ({
    id,
    type: 'rectangle',
    customData: { path },
    opacity: 80,
    strokeColor: '#123456',
    backgroundColor: '#ffffff',
    strokeWidth: 1,
    x: 913,
    y: 17,
  });
  const original = [
    card('root-card', 'root.ts'),
    card('direct-card', 'direct.ts'),
    card('indirect-card', 'indirect.ts'),
    card('other-card', 'unrelated.ts'),
    {
      id: 'label',
      type: 'text',
      containerId: 'direct-card',
      text: 'My edited label',
      opacity: 100,
      strokeColor: '#123456',
      backgroundColor: 'transparent',
      strokeWidth: 1,
    },
    {
      id: 'arrow',
      type: 'arrow',
      startBinding: { elementId: 'direct-card' },
      endBinding: { elementId: 'root-card' },
      opacity: 100,
      strokeColor: '#123456',
      backgroundColor: 'transparent',
      strokeWidth: 1,
    },
    {
      id: 'note',
      type: 'text',
      text: 'Keep my note',
      opacity: 80,
      strokeColor: '#123456',
      backgroundColor: 'transparent',
      strokeWidth: 1,
    },
  ];
  const before = structuredClone(original);
  const highlighted = highlightImpact(original, impact);
  assert.deepEqual(original, before);
  assert.equal('x' in highlighted[0] && highlighted[0].x, 913);
  assert.equal('text' in highlighted[4] && highlighted[4].text, 'My edited label');
  assert.equal(highlighted[4].opacity, 100);
  assert.equal(highlighted[5].opacity, 100);
  assert.ok(highlighted[3].opacity < 30);
  assert.equal('text' in highlighted[6] && highlighted[6].text, 'Keep my note');
  assert.equal(new Set(highlighted.slice(0, 3).map((e) => e.strokeColor)).size, 3);
});
