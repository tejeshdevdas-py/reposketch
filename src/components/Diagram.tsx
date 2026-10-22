import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import {
  Excalidraw,
  convertToExcalidrawElements,
  exportToBlob,
  serializeAsJSON,
  CaptureUpdateAction,
} from '@excalidraw/excalidraw';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import '@excalidraw/excalidraw/index.css';
import type { Analysis } from '../../shared/types';
import { layoutGraph, routeConnection } from '../layout';
import { highlightImpact, type ImpactResult } from '../impact';

export interface DiagramHandle {
  fit(): void;
  focus(path: string): void;
  export(format: 'png' | 'excalidraw'): Promise<void>;
}

function fileColor(path: string): { fill: string; stroke: string } {
  if (/\/(?:components|pages)\//.test(path) || /\.tsx$/.test(path))
    return { fill: '#eeebff', stroke: '#8e80cb' };
  if (/\/(?:hooks|lib|utils)\//.test(path)) return { fill: '#e7f3ed', stroke: '#77a08a' };
  if (/\/(?:types|models)\//.test(path)) return { fill: '#fff1db', stroke: '#c2a16a' };
  return { fill: '#e8f0fb', stroke: '#7e9abb' };
}

type Skeleton = NonNullable<Parameters<typeof convertToExcalidrawElements>[0]>[number];

function makeScene(analysis: Analysis) {
  const positions = layoutGraph(analysis);
  const ids = new Map(analysis.files.map((file, i) => [file.id, `file-${i}`]));
  const skeleton: Skeleton[] = [
    {
      type: 'text',
      id: 'map-title',
      x: 0,
      y: -10,
      text: `${analysis.repository.fullName}`,
      fontSize: 25,
      fontFamily: 2,
      strokeColor: '#32333b',
    },
    {
      type: 'text',
      id: 'map-subtitle',
      x: 0,
      y: 29,
      text: `${analysis.stats.files} source files · ${analysis.stats.connections} import references · Made with RepoSketch`,
      fontSize: 13,
      fontFamily: 2,
      strokeColor: '#85858e',
    },
  ];
  for (const file of analysis.files) {
    const { x, y } = positions.get(file.id)!;
    const color = fileColor(file.path);
    skeleton.push({
      type: 'rectangle',
      id: ids.get(file.id),
      x,
      y,
      width: 238,
      height: 92,
      backgroundColor: color.fill,
      strokeColor: color.stroke,
      fillStyle: 'solid',
      strokeWidth: 1.5,
      roughness: 0.8,
      roundness: { type: 3 },
      customData: { path: file.path },
      link: file.url ?? null,
      label: {
        text: `${file.name}\n${file.directory === '.' ? 'root' : file.directory}`,
        fontSize: 15,
        fontFamily: 2,
        strokeColor: '#393744',
      },
    });
  }
  const pairs = new Map<string, { source: string; target: string; typeOnly: boolean }>();
  for (const edge of analysis.edges) {
    const key = `${edge.source}\0${edge.target}`;
    const previous = pairs.get(key);
    pairs.set(key, {
      source: edge.source,
      target: edge.target,
      typeOnly: previous ? previous.typeOnly && edge.typeOnly : edge.typeOnly,
    });
  }
  for (const edge of pairs.values()) {
    if (edge.source === edge.target) continue;
    const a = positions.get(edge.source)!,
      b = positions.get(edge.target)!;
    const route = routeConnection(a, b);
    const start = route[0];
    const end = route.at(-1)!;
    skeleton.push({
      type: 'arrow',
      x: start.x,
      y: start.y,
      width: end.x - start.x,
      height: end.y - start.y,
      points: route.map((point) => [point.x - start.x, point.y - start.y]),
      start: { id: ids.get(edge.source)! },
      end: { id: ids.get(edge.target)! },
      strokeColor: edge.typeOnly ? '#c5b38e' : '#a5a8b5',
      strokeWidth: 1.2,
      roughness: 0.5,
      strokeStyle: edge.typeOnly ? 'dashed' : 'solid',
      endArrowhead: 'arrow',
    });
  }
  const elements = convertToExcalidrawElements(skeleton, { regenerateIds: false });
  return [
    ...elements.filter((e) => e.type === 'arrow'),
    ...elements.filter((e) => e.type !== 'arrow'),
  ];
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

const Diagram = forwardRef<
  DiagramHandle,
  {
    analysis: Analysis;
    impact: ImpactResult | null;
    onSelect: (path: string) => void;
    onReady: () => void;
  }
>(function Diagram({ analysis, impact, onSelect, onReady }, ref) {
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const lastSelected = useRef('');
  const originalScene = useRef<ReturnType<
    ExcalidrawImperativeAPI['getSceneElementsIncludingDeleted']
  > | null>(null);
  const initialData = useMemo(
    () => ({
      elements: makeScene(analysis),
      appState: {
        viewBackgroundColor: '#fbfbfa',
        gridModeEnabled: false,
        currentItemFontFamily: 2 as const,
      },
      scrollToContent: true,
    }),
    [analysis],
  );
  useEffect(() => {
    if (!api) return;
    const frame = requestAnimationFrame(() =>
      api.scrollToContent(api.getSceneElements(), {
        fitToViewport: true,
        viewportZoomFactor: 0.9,
        canvasOffsets: { top: 70, bottom: 55, left: 20, right: 20 },
        animate: false,
      }),
    );
    return () => cancelAnimationFrame(frame);
  }, [api]);
  useEffect(() => {
    if (!api) return;
    if (impact) {
      if (!originalScene.current)
        originalScene.current = structuredClone(api.getSceneElementsIncludingDeleted());
      const elements = highlightImpact(originalScene.current, impact);
      api.updateScene({
        elements,
        appState: { selectedElementIds: {} },
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      const affected = elements.filter(
        (element) =>
          !element.isDeleted &&
          typeof element.customData?.path === 'string' &&
          (element.customData.path === impact.root || impact.paths.has(element.customData.path)),
      );
      if (affected.length)
        api.scrollToContent(affected, {
          fitToViewport: true,
          maxZoom: 1,
          viewportZoomFactor: 0.85,
          canvasOffsets: { top: 35, bottom: 45, left: 30, right: 30 },
          animate: false,
        });
    } else if (originalScene.current) {
      api.updateScene({
        elements: originalScene.current,
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      originalScene.current = null;
      lastSelected.current = '';
    }
  }, [api, impact]);
  useImperativeHandle(
    ref,
    () => ({
      fit() {
        if (api)
          api.scrollToContent(api.getSceneElements(), {
            fitToViewport: true,
            viewportZoomFactor: 0.9,
            canvasOffsets: { top: 70, bottom: 55, left: 20, right: 20 },
            animate: false,
          });
      },
      focus(path) {
        if (!api) return;
        const element = api.getSceneElements().find((e) => e.customData?.path === path);
        if (!element) return;
        if (!impact) {
          lastSelected.current = path;
          api.updateScene({ appState: { selectedElementIds: { [element.id]: true } } });
        }
        api.scrollToContent(element, {
          fitToViewport: true,
          maxZoom: 1,
          viewportZoomFactor: 0.65,
          canvasOffsets: { top: 70, bottom: 55, left: 20, right: 20 },
          animate: false,
        });
      },
      async export(format) {
        if (!api) throw new Error('The canvas is still loading. Please try again.');
        const elements = api.getSceneElements();
        if (!elements.length) throw new Error('Add something to the canvas before exporting.');
        const filename = `${analysis.repository.name}-reposketch`;
        if (format === 'png') {
          const blob = await exportToBlob({
            elements,
            appState: { ...api.getAppState(), exportBackground: true, exportWithDarkMode: false },
            files: api.getFiles(),
            maxWidthOrHeight: 4000,
            exportPadding: 48,
          });
          download(blob, `${filename}.png`);
        } else
          download(
            new Blob([serializeAsJSON(elements, api.getAppState(), api.getFiles(), 'local')], {
              type: 'application/json',
            }),
            `${filename}.excalidraw`,
          );
      },
    }),
    [api, analysis, impact],
  );
  return (
    <div className="diagram-host" aria-label="Editable repository architecture diagram">
      <Excalidraw
        initialData={initialData}
        excalidrawAPI={(instance) => {
          setApi(instance);
          onReady();
        }}
        theme="light"
        viewModeEnabled={!!impact}
        name={`${analysis.repository.name} — RepoSketch`}
        UIOptions={{
          canvasActions: {
            changeViewBackgroundColor: false,
            clearCanvas: false,
            loadScene: false,
            saveToActiveFile: false,
            saveAsImage: false,
            export: false,
            toggleTheme: false,
          },
        }}
        onChange={(elements, state) => {
          if (impact) return;
          const selected = elements.find(
            (e) => state.selectedElementIds[e.id] && e.customData?.path,
          );
          const path = selected?.customData?.path;
          if (typeof path === 'string' && path !== lastSelected.current) {
            lastSelected.current = path;
            onSelect(path);
          }
        }}
      />
    </div>
  );
});
export default Diagram;
