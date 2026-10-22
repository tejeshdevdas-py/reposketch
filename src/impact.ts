import type { Analysis, Edge } from '../shared/types';

export interface ImpactResult {
  root: string;
  paths: Map<string, Edge[]>;
  direct: number;
  indirect: number;
  pairs: Set<string>;
}

export function analyzeImpact(
  analysis: Analysis,
  root: string,
  includeTypes: boolean,
): ImpactResult {
  const result: ImpactResult = { root, paths: new Map(), direct: 0, indirect: 0, pairs: new Set() };
  const files = new Set(analysis.files.map((file) => file.id));
  if (!files.has(root)) return result;
  const edges = analysis.edges.filter(
    (edge) => (includeTypes || !edge.typeOnly) && files.has(edge.source) && files.has(edge.target),
  );
  const incoming = new Map<string, Edge[]>();
  for (const edge of edges) incoming.set(edge.target, [...(incoming.get(edge.target) ?? []), edge]);
  const visited = new Set([root]);
  const queue = [root];
  for (let i = 0; i < queue.length; i++) {
    const target = queue[i];
    for (const edge of incoming.get(target) ?? []) {
      if (visited.has(edge.source)) continue;
      visited.add(edge.source);
      const path = [edge, ...(result.paths.get(target) ?? [])];
      result.paths.set(edge.source, path);
      if (path.length === 1) result.direct++;
      else result.indirect++;
      queue.push(edge.source);
    }
  }
  for (const edge of edges) {
    if (visited.has(edge.source) && visited.has(edge.target)) {
      result.pairs.add(`${edge.source}\0${edge.target}`);
    }
  }
  return result;
}

interface ImpactElement {
  id: string;
  type: string;
  opacity: number;
  strokeColor: string;
  backgroundColor: string;
  strokeWidth: number;
  customData?: Record<string, unknown>;
  containerId?: string | null;
  startBinding?: { elementId: string } | null;
  endBinding?: { elementId: string } | null;
}

export function highlightImpact<T extends ImpactElement>(
  elements: readonly T[],
  impact: ImpactResult,
): T[] {
  const paths = new Map(elements.map((element) => [element.id, element.customData?.path]));
  const colors = (path: unknown) => {
    if (path === impact.root) return { stroke: '#7047b8', fill: '#eee5ff' };
    if (typeof path !== 'string' || !impact.paths.has(path)) return undefined;
    return impact.paths.get(path)!.length === 1
      ? { stroke: '#b45b16', fill: '#fff0d8' }
      : { stroke: '#237a71', fill: '#def4ed' };
  };
  return elements.map((element) => {
    if (element.id === 'map-title' || element.id === 'map-subtitle') return { ...element };
    if (element.type === 'arrow') {
      const source = paths.get(element.startBinding?.elementId ?? '');
      const target = paths.get(element.endBinding?.elementId ?? '');
      if (
        typeof source === 'string' &&
        typeof target === 'string' &&
        impact.pairs.has(`${source}\0${target}`)
      ) {
        return {
          ...element,
          opacity: 100,
          strokeColor: colors(source)?.stroke ?? '#7047b8',
          strokeWidth: 2,
        };
      }
    } else {
      const color = colors(element.customData?.path ?? paths.get(element.containerId ?? ''));
      if (color)
        return {
          ...element,
          opacity: 100,
          strokeColor: color.stroke,
          backgroundColor: element.type === 'text' ? element.backgroundColor : color.fill,
          strokeWidth: element.type === 'text' ? element.strokeWidth : 2.5,
        };
    }
    return { ...element, opacity: Math.min(element.opacity, 15) };
  });
}
