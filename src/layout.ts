import type { Analysis } from '../shared/types.js';
export interface Position {
  x: number;
  y: number;
}

export function routeConnection(source: Position, target: Position): Position[] {
  const gap = 12;
  const width = 238;
  const sourceY = source.y + 46;
  const targetY = target.y + 46;
  const forward = target.x > source.x;
  const sameColumn = target.x === source.x;
  const startX = forward || sameColumn ? source.x + width + gap : source.x - gap;
  const endX = forward ? target.x - gap : target.x + width + gap;
  // Keep the first and last segments perpendicular to the card edges so the
  // arrowhead cannot be hidden by a card when the files are far apart vertically.
  const bendX = sameColumn ? startX + 34 : (startX + endX) / 2;
  if (sourceY === targetY)
    return [
      { x: startX, y: sourceY },
      { x: endX, y: targetY },
    ];
  return [
    { x: startX, y: sourceY },
    { x: bendX, y: sourceY },
    { x: bendX, y: targetY },
    { x: endX, y: targetY },
  ];
}

export function layoutGraph(analysis: Analysis): Map<string, Position> {
  const incoming = new Set(
    analysis.edges.filter((e) => e.source !== e.target).map((e) => e.target),
  );
  const outgoing = new Map<string, string[]>();
  for (const edge of analysis.edges)
    outgoing.set(edge.source, [...(outgoing.get(edge.source) ?? []), edge.target]);
  const roots = analysis.files
    .filter((f) => !incoming.has(f.id))
    .sort((a, b) => Number(!!b.entryReason) - Number(!!a.entryReason));
  const depths = new Map<string, number>();
  const queue: string[] = [];
  function visit(start: string) {
    if (depths.has(start)) return;
    depths.set(start, 0);
    queue.push(start);
    for (let index = 0; index < queue.length; index++) {
      const id = queue[index];
      for (const next of outgoing.get(id) ?? [])
        if (!depths.has(next)) {
          depths.set(next, Math.min(depths.get(id)! + 1, 7));
          queue.push(next);
        }
    }
    queue.length = 0;
  }
  for (const file of roots) visit(file.id);
  for (const file of analysis.files) visit(file.id);
  const columns = new Map<number, string[]>();
  for (const [id, depth] of depths) columns.set(depth, [...(columns.get(depth) ?? []), id]);
  const maxRows = Math.max(1, ...[...columns.values()].map((v) => v.length));
  const positions = new Map<string, Position>();
  for (const [depth, ids] of columns)
    ids.forEach((id, row) =>
      positions.set(id, { x: depth * 330, y: (row + (maxRows - ids.length) / 2) * 145 + 100 }),
    );
  return positions;
}
