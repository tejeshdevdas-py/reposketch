import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutGraph, routeConnection } from '../src/layout.js';
import { analyzeRepository } from '../server/analyze.js';
import { demo } from '../server/demo.js';

test('lays out every file once, separates cards, and orders entry before dependencies', () => {
  const positions = layoutGraph(demo);
  assert.equal(positions.size, demo.files.length);
  assert.ok(positions.get('src/main.tsx')!.x < positions.get('src/App.tsx')!.x);
  const values = [...positions.values()];
  assert.equal(new Set(values.map((p) => `${p.x}:${p.y}`)).size, values.length);
  for (const a of values)
    for (const b of values)
      if (a !== b) assert.ok(Math.abs(a.x - b.x) >= 250 || Math.abs(a.y - b.y) >= 90);
});

test('handles cycles and disconnected files with finite coordinates', () => {
  const graph = analyzeRepository(
    { 'a.ts': 'import "./b";', 'b.ts': 'import "./a";', 'other.ts': 'export const a = 1;' },
    demo.repository,
  );
  const positions = layoutGraph(graph);
  assert.equal(positions.size, 3);
  assert.ok([...positions.values()].every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)));
});

test('steep connections approach the card horizontally with visible arrowhead clearance', () => {
  for (const target of [
    { x: 330, y: 2500 },
    { x: 330, y: -2500 },
  ]) {
    const points = routeConnection({ x: 0, y: 100 }, target);
    const end = points.at(-1)!;
    const before = points.at(-2)!;
    assert.ok(end.x <= target.x - 10, 'arrowhead must stop outside the card');
    assert.equal(before.y, end.y, 'arrowhead must approach the left edge horizontally');
    assert.ok(before.x < end.x, 'arrowhead must point toward the card');
    assert.ok(points[0].x > 238, 'tail must start outside the source card');
  }
});

test('backward and same-column connections stay outside both endpoint cards', () => {
  for (const target of [
    { x: 0, y: 400 },
    { x: 330, y: 400 },
  ]) {
    const source = { x: 330, y: 100 };
    const points = routeConnection(source, target);
    const end = points.at(-1)!;
    const before = points.at(-2)!;
    assert.ok(end.x >= target.x + 248);
    assert.equal(before.y, end.y);
    assert.ok(before.x > end.x, 'approach the right edge from outside');
    assert.ok(points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)));
  }
});
