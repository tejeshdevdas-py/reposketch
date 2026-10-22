import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Code2,
  Download,
  FileCode2,
  Folder,
  GitBranch,
  Github,
  Info,
  Layers,
  Link2,
  LoaderCircle,
  Maximize,
  Network,
  Play,
  Search,
  SlidersHorizontal,
  Sparkles,
  SquareArrowOutUpRight,
  X,
} from 'lucide-react';
import type { Analysis } from '../shared/types';
import type { DiagramHandle } from './components/Diagram';
import Inspector from './components/Inspector';
import { analyzeImpact } from './impact';

const Diagram = lazy(() => import('./components/Diagram'));

function Logo() {
  return (
    <div className="brand-mark">
      <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <rect x="5" y="5" width="7" height="7" rx="1.7" />
        <rect x="20" y="20" width="7" height="7" rx="1.7" />
        <path d="M8.5 12v11.5H20M12 8.5h11.5V20" />
      </svg>
    </div>
  );
}

export default function App() {
  const [analysis, setAnalysis] = useState<Analysis>();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string>();
  const [search, setSearch] = useState('');
  const [ready, setReady] = useState(false);
  const [sceneVersion, setSceneVersion] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportMenu, setExportMenu] = useState(false);
  const [notice, setNotice] = useState('');
  const [notes, setNotes] = useState(false);
  const [styleControls, setStyleControls] = useState(false);
  const [tour, setTour] = useState<number | null>(null);
  const [impactEnabled, setImpactEnabled] = useState(false);
  const [includeTypes, setIncludeTypes] = useState(false);
  const diagram = useRef<DiagramHandle>(null);
  const abort = useRef<AbortController | null>(null);
  const menu = useRef<HTMLDivElement>(null);

  const load = useCallback(async (repository?: string) => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setLoading(true);
    setError('');
    try {
      const response = await fetch(repository ? '/api/analyze' : '/api/demo', {
        method: repository ? 'POST' : 'GET',
        headers: { 'Content-Type': 'application/json' },
        body: repository ? JSON.stringify({ repository }) : undefined,
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'The repository could not be analyzed.');
      if (controller.signal.aborted) return;
      setAnalysis(data);
      setSceneVersion((version) => version + 1);
      setSelected(undefined);
      setSearch('');
      setTour(null);
      setImpactEnabled(false);
      setIncludeTypes(false);
      setReady(false);
      setNotes(false);
      const url = new URL(location.href);
      if (repository) {
        url.searchParams.set('repo', data.repository.fullName);
        setInput(data.repository.url);
      } else {
        url.searchParams.delete('repo');
        setInput('');
      }
      history.replaceState(null, '', url);
    } catch (e) {
      if (!controller.signal.aborted)
        setError(e instanceof Error ? e.message : 'Could not load the repository.');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load(new URL(location.href).searchParams.get('repo') ?? undefined);
    return () => abort.current?.abort();
  }, [load]);
  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(''), 3500);
    return () => clearTimeout(timeout);
  }, [notice]);
  useEffect(() => {
    function close(e: MouseEvent) {
      if (!menu.current?.contains(e.target as Node)) setExportMenu(false);
    }
    function escape(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setExportMenu(false);
        setNotes(false);
        setTour(null);
        setImpactEnabled(false);
      }
    }
    document.addEventListener('click', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('keydown', escape);
    };
  }, []);

  const selectFile = useCallback((path: string) => {
    setSelected(path);
    diagram.current?.focus(path);
  }, []);
  const markReady = useCallback(() => setReady(true), []);
  const groups = useMemo(() => {
    const result = new Map<string, Analysis['files']>();
    for (const file of analysis?.files ?? [])
      if (file.path.toLowerCase().includes(search.toLowerCase()))
        result.set(file.directory, [...(result.get(file.directory) ?? []), file]);
    return result;
  }, [analysis, search]);
  const walkthrough = useMemo(() => {
    if (!analysis) return [];
    const incoming = new Set(analysis.edges.map((e) => e.target));
    const entry =
      analysis.files.find((f) => f.entryReason && !incoming.has(f.id)) ??
      analysis.files.find((f) => f.entryReason) ??
      analysis.files[0];
    const visited = new Set<string>();
    const order: string[] = [];
    const queue = entry ? [entry.id] : [];
    while (queue.length) {
      const id = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      order.push(id);
      queue.push(
        ...analysis.edges.filter((e) => e.source === id && !e.typeOnly).map((e) => e.target),
      );
    }
    return order.slice(0, 8);
  }, [analysis]);
  const moveTour = (index: number) => {
    setImpactEnabled(false);
    setTour(index);
    selectFile(walkthrough[index]);
  };
  async function exportScene(format: 'png' | 'excalidraw') {
    setExportMenu(false);
    setExporting(true);
    try {
      if (!diagram.current) throw new Error('Canvas is still loading.');
      await diagram.current.export(format);
      setNotice(
        format === 'png' ? 'PNG exported. Ready to share.' : 'Editable Excalidraw file exported.',
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExporting(false);
    }
  }
  async function copyLink() {
    if (analysis?.repository.isDemo) {
      setNotice('Map a GitHub repository to create a link.');
      return;
    }
    try {
      await navigator.clipboard.writeText(location.href);
      setNotice('Repository link copied. Canvas edits are shared through exports.');
    } catch {
      setError('Clipboard unavailable. Copy the URL from your address bar.');
    }
  }
  const activeFile = analysis?.files.find((f) => f.id === selected);
  const impact = useMemo(
    () =>
      analysis && selected && impactEnabled
        ? analyzeImpact(analysis, selected, includeTypes)
        : null,
    [analysis, selected, impactEnabled, includeTypes],
  );
  const toggleImpact = () => {
    setImpactEnabled((value) => !value);
    setTour(null);
  };
  const tourFile =
    tour !== null ? analysis?.files.find((f) => f.id === walkthrough[tour]) : undefined;

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="RepoSketch home">
          <Logo />
          <span>
            RepoSketch<span className="brand-dot">.</span>
          </span>
          <span className="beta-tag">BETA</span>
        </a>
        <div className="topbar-caption">A little clarity for your codebase.</div>
        <div className="topbar-right">
          <a
            className="open-source"
            href="https://github.com/tejeshdevdas-py/reposketch"
            target="_blank"
            rel="noreferrer"
          >
            <Code2 size={14} /> Open source
          </a>
          <a
            href="https://github.com/excalidraw/excalidraw"
            target="_blank"
            rel="noreferrer"
            className="github-link"
          >
            <Github size={17} />
            <span>Built with Excalidraw</span>
            <ArrowUpRight size={14} />
          </a>
        </div>
      </header>

      <section className="intro">
        <div className="intro-copy">
          <div className="eyebrow">
            <span /> FROM REPOSITORY TO BIG PICTURE
          </div>
          <h1>
            Code makes more sense
            <br className="mobile-br" /> when you <span>see it.</span>
            <svg className="headline-scribble" viewBox="0 0 140 12" aria-hidden="true">
              <path d="M2 8C35 1 77 2 136 6M15 10C50 6 80 5 123 8" />
            </svg>
          </h1>
          <p>Turn a GitHub repo into a map you can explore, edit, and share.</p>
        </div>
        <div className="repo-input-area">
          <form
            className={`repo-form ${loading ? 'is-loading' : ''}`}
            onSubmit={(e) => {
              e.preventDefault();
              if (input.trim()) void load(input);
            }}
          >
            <Github size={20} />
            <input
              aria-label="GitHub repository URL"
              disabled={loading}
              placeholder="github.com/owner/repository"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              required
              autoComplete="off"
              spellCheck={false}
            />
            <button className="primary-button" disabled={loading || !input.trim()} type="submit">
              {loading ? (
                <>
                  <LoaderCircle size={16} className="spin" />
                  <span>Mapping…</span>
                </>
              ) : (
                <>
                  <span>Map repository</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>
          <div className="input-hint">
            <span>Public JavaScript & TypeScript repos</span>
            <span className="hint-dot">·</span>
            <button disabled={loading} onClick={() => void load()}>
              Try the sample <ArrowUpRight size={12} />
            </button>
          </div>
        </div>
      </section>

      {error && (
        <div className="error-banner" role="alert">
          <Info size={17} />
          <span>{error}</span>
          <button className="icon-button" onClick={() => setError('')} aria-label="Dismiss error">
            <X size={16} />
          </button>
        </div>
      )}

      <main className="workbench">
        <div className="workspace-bar">
          <div className="repository-title">
            <div className="repo-avatar">
              <Github size={20} />
            </div>
            <div>
              <div className="repository-name">
                {analysis?.repository.fullName ?? 'Your next big picture'}
                {analysis?.repository.isDemo && <span className="sample-tag">SAMPLE</span>}
              </div>
              <div className="repository-subtitle">
                <GitBranch size={12} />
                {analysis?.repository.defaultBranch ?? 'Ready when you are'}
                {analysis && (
                  <>
                    <span>·</span>
                    <span>
                      {analysis.repository.isDemo
                        ? 'A tiny task manager, mapped out'
                        : `commit ${analysis.repository.commit.slice(0, 7)}`}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="workspace-actions">
            <button
              className="text-button walkthrough-trigger"
              disabled={!ready || loading}
              onClick={() => moveTour(0)}
            >
              <Play size={14} /> Walk me through
            </button>
            <span className="action-divider" />
            <button
              className="icon-button share-button"
              aria-label="Copy repository link"
              title="Copy link to re-analyze this repository (edits are not included)"
              onClick={() => void copyLink()}
              disabled={!analysis || loading}
            >
              <Link2 size={17} />
            </button>
            <div className="export-control" ref={menu}>
              <button
                className="secondary-button"
                aria-expanded={exportMenu}
                aria-haspopup="menu"
                disabled={!ready || loading || exporting}
                onClick={() => setExportMenu(!exportMenu)}
              >
                {exporting ? <LoaderCircle size={15} className="spin" /> : <Download size={15} />}
                <span>Export</span>
                <ChevronDown size={13} />
              </button>
              {exportMenu && (
                <div className="export-menu" role="menu">
                  <button role="menuitem" onClick={() => void exportScene('png')}>
                    <SquareArrowOutUpRight size={16} />
                    <span>
                      Export PNG<small>A picture worth sharing</small>
                    </span>
                  </button>
                  <button role="menuitem" onClick={() => void exportScene('excalidraw')}>
                    <FileCode2 size={16} />
                    <span>
                      Excalidraw file<small>Keep every edit and annotation</small>
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="workspace-body">
          <aside className="explorer">
            <div className="panel-label">
              EXPLORER <span>{analysis?.stats.files ?? 0}</span>
            </div>
            <label className="file-search">
              <Search size={14} />
              <input
                aria-label="Find a file"
                placeholder="Find a file…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button aria-label="Clear file search" onClick={() => setSearch('')}>
                  <X size={13} />
                </button>
              )}
            </label>
            <div className="file-tree">
              {[...groups].map(([dir, files]) => (
                <div className="file-group" key={dir}>
                  <div className="folder-label">
                    <ChevronDown size={12} />
                    <Folder size={13} />
                    <span>{dir === '.' ? 'root' : dir}</span>
                  </div>
                  {files.map((file) => (
                    <button
                      key={file.id}
                      className={`file-row ${selected === file.id ? 'selected' : ''}`}
                      onClick={() => selectFile(file.id)}
                      title={file.path}
                    >
                      <span className={`file-extension ${/tsx|jsx/.test(file.name) ? 'jsx' : ''}`}>
                        {/tsx|jsx/.test(file.name) ? 'tsx' : /\.ts$/.test(file.name) ? 'ts' : 'js'}
                      </span>
                      <span>{file.name}</span>
                      {file.entryReason && <span className="entry-dot" title="Entry candidate" />}
                    </button>
                  ))}
                </div>
              ))}
              {analysis && groups.size === 0 && (
                <div className="no-files">No files match “{search}”.</div>
              )}
            </div>
            <div className="explorer-bottom">
              <span className="entry-dot" /> Entry candidate{' '}
              <button
                className="icon-button"
                aria-label="About this analysis"
                onClick={() => setNotes(!notes)}
              >
                <Info size={13} />
              </button>
            </div>
          </aside>

          <section className={`canvas-panel ${styleControls ? 'show-properties' : ''}`}>
            <div className="canvas-tabs">
              <div className="active">
                <Network size={15} /> Architecture map
              </div>
              <div className="canvas-mode">
                <span /> {impact ? 'Impact view' : 'Editable canvas'}
              </div>
              <button
                className="icon-button"
                aria-label="Toggle drawing style controls"
                aria-pressed={styleControls}
                title="Show drawing style controls"
                onClick={() => setStyleControls(!styleControls)}
                disabled={!!impact}
              >
                <SlidersHorizontal size={15} />
              </button>
              <button
                className="icon-button"
                aria-label="Fit diagram to view"
                title="Fit diagram to view"
                onClick={() => diagram.current?.fit()}
                disabled={!ready}
              >
                <Maximize size={15} />
              </button>
            </div>
            <div className={`impact-toolbar ${impact ? 'is-active' : ''}`}>
              <button
                className="impact-toggle"
                aria-pressed={!!impact}
                disabled={!activeFile || !ready || loading}
                onClick={toggleImpact}
              >
                <Network size={15} />
                {impact ? 'Exit impact view' : 'What depends on this?'}
              </button>
              {impact ? (
                <label className="impact-type-filter">
                  <input
                    type="checkbox"
                    checked={includeTypes}
                    onChange={(event) => setIncludeTypes(event.target.checked)}
                  />{' '}
                  Include type-only imports
                </label>
              ) : (
                <span>
                  {activeFile
                    ? `Explore dependents of ${activeFile.name}`
                    : 'Select a file to explore its potential impact'}
                </span>
              )}
            </div>
            <div className="canvas-stage">
              {analysis ? (
                <Suspense
                  fallback={
                    <div className="canvas-placeholder">
                      <LoaderCircle size={24} className="spin" />
                      <span>Unfolding the canvas…</span>
                    </div>
                  }
                >
                  <Diagram
                    key={`${analysis.repository.fullName}:${analysis.repository.commit}:${sceneVersion}`}
                    ref={diagram}
                    analysis={analysis}
                    impact={impact}
                    onSelect={setSelected}
                    onReady={markReady}
                  />
                </Suspense>
              ) : (
                <div className="canvas-placeholder">
                  <Network size={42} />
                  <h2>Your codebase, connected.</h2>
                  <p>Map a repository or explore the sample.</p>
                  <button
                    className="secondary-button"
                    disabled={loading}
                    onClick={() => void load()}
                  >
                    Explore sample <ArrowRight size={15} />
                  </button>
                </div>
              )}
              {loading && (
                <div className="loading-overlay" role="status">
                  <div className="loading-card">
                    <LoaderCircle size={24} className="spin" />
                    <h3>Connecting the dots</h3>
                    <p>
                      Reading source files and following imports.
                      <br />
                      Larger repositories may take a moment.
                    </p>
                    <button
                      className="text-button"
                      onClick={() => {
                        abort.current?.abort();
                        setLoading(false);
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              {tourFile && tour !== null && (
                <div className="walkthrough-card">
                  <div className="walkthrough-top">
                    <span>
                      <Sparkles size={14} /> THE GUIDED ROUTE
                    </span>
                    <button
                      className="icon-button"
                      aria-label="Close walkthrough"
                      onClick={() => setTour(null)}
                    >
                      <X size={15} />
                    </button>
                  </div>
                  <h3>
                    {tour === 0 ? 'Start here: ' : 'Then explore: '}
                    {tourFile.name}
                  </h3>
                  <p>
                    {tour === 0
                      ? `${tourFile.entryReason ?? 'A starting file in this repository'}. Follow its imports to see how the pieces connect.`
                      : `${analysis?.edges.filter((e) => e.source === tourFile.id && !e.typeOnly).length} local code reference(s). Inspect the source to understand this file’s role.`}
                  </p>
                  <div className="walkthrough-bottom">
                    <span>
                      {tour + 1} / {walkthrough.length}
                    </span>
                    <div>
                      <button
                        className="icon-button"
                        aria-label="Previous walkthrough step"
                        disabled={tour === 0}
                        onClick={() => moveTour(tour - 1)}
                      >
                        <ChevronLeft size={17} />
                      </button>
                      <button
                        className="primary-button small-button"
                        onClick={() =>
                          tour + 1 < walkthrough.length ? moveTour(tour + 1) : setTour(null)
                        }
                      >
                        {tour + 1 < walkthrough.length ? 'Next file' : 'Finish'}
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="canvas-footer">
              {impact ? (
                <div className="legend impact-legend" aria-label="Impact legend">
                  <span>
                    <i className="impact-dot root" />
                    Selected
                  </span>
                  <span>
                    <i className="impact-dot direct" />
                    {impact.direct} direct
                  </span>
                  <span>
                    <i className="impact-dot indirect" />
                    {impact.indirect} indirect
                  </span>
                </div>
              ) : (
                <div className="legend">
                  <span>
                    <i className="legend-line" />
                    Import
                  </span>
                  <span>
                    <i className="legend-line dashed" />
                    Type only
                  </span>
                </div>
              )}
              <span className="canvas-tip">
                {impact
                  ? 'Read-only view · choose files in the explorer'
                  : 'Select to inspect · drag to rearrange · scroll to pan'}
              </span>
            </div>
          </section>

          {analysis && (
            <Inspector
              analysis={analysis}
              file={activeFile}
              impact={impact}
              onImpact={toggleImpact}
              onExitImpact={() => setImpactEnabled(false)}
              onFocus={(path) => diagram.current?.focus(path)}
              onSelect={selectFile}
              onClose={() => {
                setSelected(undefined);
                setImpactEnabled(false);
              }}
            />
          )}
        </div>
        <div className="workspace-status">
          <div>
            <span className="status-dot" />
            <span>{analysis ? 'Source-backed map' : 'Ready to explore'}</span>
            <span className="status-separator">/</span>
            <span>{analysis?.stats.files ?? 0} files</span>
            <span>{analysis?.stats.connections ?? 0} references</span>
            <span>{analysis?.stats.packages ?? 0} external packages</span>
          </div>
          <button onClick={() => setNotes(!notes)}>
            <Info size={13} />
            {analysis?.warnings.length
              ? `${analysis.warnings.length} analysis notes`
              : 'How this map works'}
            <ChevronDown size={12} />
          </button>
        </div>
        {notes && (
          <div className="analysis-notes">
            <h3>Read the map with confidence.</h3>
            <p>
              Arrows represent imports found in source code. They show dependencies, not runtime
              call order. Multiple imports between two files share one arrow; the inspector lists
              every reference.
            </p>
            <p>
              Entry candidates come from package metadata and common filenames. External packages
              are listed in the inspector. This version supports repositories up to 250 source
              files.
            </p>
            {analysis?.warnings.map((warning, i) => (
              <p className="analysis-warning" key={i}>
                <Info size={14} />
                {warning}
              </p>
            ))}
          </div>
        )}
      </main>

      <footer className="page-footer">
        <span>
          <Layers size={14} /> Built for the “where do I even start?” moment.
        </span>
        <span>Read the code. See the connections.</span>
      </footer>
      {notice && (
        <div className="toast" role="status">
          <Check size={16} />
          {notice}
        </div>
      )}
    </div>
  );
}
