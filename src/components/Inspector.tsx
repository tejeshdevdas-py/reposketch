import { useEffect, useRef, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Code2,
  ExternalLink,
  FileCode2,
  GitBranch,
  Info,
  X,
} from 'lucide-react';
import type { Analysis, FileNode } from '../../shared/types';
import type { ImpactResult } from '../impact';
import ImpactPanel from './ImpactPanel';

export default function Inspector({
  analysis,
  file,
  onSelect,
  onClose,
  impact,
  onImpact,
  onExitImpact,
  onFocus,
}: {
  analysis: Analysis;
  file?: FileNode;
  onSelect: (path: string) => void;
  onClose: () => void;
  impact: ImpactResult | null;
  onImpact: () => void;
  onExitImpact: () => void;
  onFocus: (path: string) => void;
}) {
  const [tab, setTab] = useState<'connections' | 'source'>('connections');
  const [line, setLine] = useState<number>();
  const code = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setLine(undefined);
  }, [file?.id]);
  useEffect(() => {
    if (line)
      code.current
        ?.querySelector(`[data-line="${line}"]`)
        ?.scrollIntoView({ block: 'center', behavior: 'instant' });
  }, [line, tab]);
  if (!file)
    return (
      <aside className="inspector empty-inspector">
        <div className="panel-label">FILE INSPECTOR</div>
        <div className="empty-icon">
          <GitBranch size={26} />
        </div>
        <h3>Every connection has a story.</h3>
        <p>
          Select a file in the map to see what it imports, who uses it, and the source behind each
          connection.
        </p>
        <div className="inspector-note">
          <Info size={15} />
          <span>Arrows follow imports, from the importing file to its dependency.</span>
        </div>
      </aside>
    );
  const incoming = analysis.edges.filter((edge) => edge.target === file.id);
  const uniqueIncoming = [...new Set(incoming.map((edge) => edge.source))];
  const local = file.imports.filter((i) => i.target);
  const external = file.imports.filter((i) => i.external);
  const unresolved = file.imports.filter((i) => !i.target && !i.external);
  const showLine = (n: number) => {
    setLine(n);
    setTab('source');
  };
  return (
    <aside className="inspector">
      <div className="panel-label inspector-heading">
        FILE INSPECTOR
        <button className="icon-button" aria-label="Close file inspector" onClick={onClose}>
          <X size={16} />
        </button>
      </div>
      <div className="selected-file-icon">
        <FileCode2 size={23} />
      </div>
      <h3 className="file-title">{file.name}</h3>
      <p className="file-path">{file.path}</p>
      <div className="file-meta">
        <span>{file.lines} lines</span>
        <span>·</span>
        <span>
          {file.path
            .match(/\.[^.]+$/)?.[0]
            .slice(1)
            .toUpperCase()}
        </span>
        {file.entryReason && <span className="entry-chip">Entry candidate</span>}
      </div>
      {file.url ? (
        <a className="source-link" href={file.url} target="_blank" rel="noreferrer">
          View on GitHub <ExternalLink size={13} />
        </a>
      ) : (
        <p className="sample-source-label">Bundled sample · source shown below</p>
      )}
      <div className="inspector-tabs" role="tablist" aria-label="File details">
        <button
          role="tab"
          aria-selected={!impact && tab === 'connections'}
          onClick={() => {
            onExitImpact();
            setTab('connections');
          }}
        >
          <GitBranch size={14} /> Connections
        </button>
        <button
          role="tab"
          aria-selected={!impact && tab === 'source'}
          onClick={() => {
            onExitImpact();
            setTab('source');
          }}
        >
          <Code2 size={14} /> Source
        </button>
        <button
          role="tab"
          aria-selected={!!impact}
          onClick={() => {
            if (!impact) onImpact();
          }}
        >
          Impact
        </button>
      </div>
      <div className="inspector-content" role="tabpanel">
        {impact ? (
          <ImpactPanel analysis={analysis} impact={impact} onFocus={onFocus} />
        ) : tab === 'source' ? (
          <div className="source-code" ref={code}>
            <pre>
              {file.source.split('\n').map((text, i) => (
                <div key={i} data-line={i + 1} className={line === i + 1 ? 'highlighted-line' : ''}>
                  <span className="line-number">{i + 1}</span>
                  <code>{text || ' '}</code>
                </div>
              ))}
            </pre>
          </div>
        ) : (
          <>
            {file.entryReason && (
              <div className="entry-explanation">
                <Info size={14} />
                <span>{file.entryReason}. This is a starting-point hint, not a runtime trace.</span>
              </div>
            )}
            <section className="connection-section">
              <h4>
                <ArrowUpRight size={15} /> Imports <span>{local.length}</span>
              </h4>
              {local.length ? (
                local.map((item, i) => (
                  <div className="connection-row" key={i}>
                    <button onClick={() => onSelect(item.target!)} title={item.target}>
                      <FileCode2 size={14} />
                      <span>
                        {item.target!.split('/').at(-1)}
                        {item.typeOnly && <small>type</small>}
                      </span>
                    </button>
                    <button
                      className="line-link"
                      title="Show import in source"
                      onClick={() => showLine(item.line)}
                    >
                      L{item.line}
                    </button>
                  </div>
                ))
              ) : (
                <p className="muted small">No local imports.</p>
              )}
            </section>
            <section className="connection-section">
              <h4>
                <ArrowDownLeft size={15} /> Imported by <span>{uniqueIncoming.length}</span>
              </h4>
              {uniqueIncoming.length ? (
                uniqueIncoming.map((id) => (
                  <div className="connection-row" key={id}>
                    <button onClick={() => onSelect(id)} title={id}>
                      <FileCode2 size={14} />
                      <span>{id.split('/').at(-1)}</span>
                      <ArrowUpRight size={13} />
                    </button>
                  </div>
                ))
              ) : (
                <p className="muted small">No other analyzed files import this file.</p>
              )}
            </section>
            {external.length > 0 && (
              <section className="connection-section">
                <h4>
                  External imports <span>{external.length}</span>
                </h4>
                {external.map((item, i) => (
                  <div className="external-row" key={i}>
                    <code>{item.specifier}</code>
                    <button className="line-link" onClick={() => showLine(item.line)}>
                      L{item.line}
                    </button>
                  </div>
                ))}
              </section>
            )}
            {unresolved.length > 0 && (
              <section className="connection-section unresolved">
                <h4>
                  Unresolved <span>{unresolved.length}</span>
                </h4>
                {unresolved.map((item, i) => (
                  <div className="external-row" key={i}>
                    <code>{item.specifier}</code>
                    <button className="line-link" onClick={() => showLine(item.line)}>
                      L{item.line}
                    </button>
                  </div>
                ))}
              </section>
            )}
          </>
        )}
      </div>
      <div className="inspector-footer">
        <span className="status-dot" /> Parsed from source · no AI guesses
      </div>
    </aside>
  );
}
