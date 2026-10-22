import { ArrowUpRight, Focus } from 'lucide-react';
import type { Analysis } from '../../shared/types';
import type { ImpactResult } from '../impact';

export default function ImpactPanel({
  analysis,
  impact,
  onFocus,
}: {
  analysis: Analysis;
  impact: ImpactResult;
  onFocus: (path: string) => void;
}) {
  const files = new Map(analysis.files.map((file) => [file.id, file]));
  return (
    <section className="impact-results" aria-label="Potential impact results">
      <div className="impact-heading">
        <span className="impact-eyebrow">POTENTIAL IMPACT</span>
        <h4>
          {impact.paths.size} dependent {impact.paths.size === 1 ? 'file' : 'files'}
        </h4>
        <p>Import paths show what could be affected, not what will break.</p>
      </div>
      <div
        className="impact-stats"
        aria-label={`${impact.direct} direct, ${impact.indirect} indirect`}
      >
        <div>
          <strong>{impact.direct}</strong>
          <span>Direct</span>
        </div>
        <div>
          <strong>{impact.indirect}</strong>
          <span>Indirect</span>
        </div>
      </div>
      {impact.paths.size === 0 ? (
        <p className="impact-empty">
          No dependents found in the analyzed files with this filter. Unresolved imports and runtime
          behavior are outside this view.
        </p>
      ) : (
        <p className="impact-help">
          Expand a file to follow one shortest import path back to the selected file.
        </p>
      )}
      {[...impact.paths].map(([id, path]) => (
        <details className="impact-path" key={`${impact.root}:${id}`}>
          <summary>
            <span>{id}</span>
            <small className={path.length === 1 ? 'impact-direct' : 'impact-indirect'}>
              {path.length === 1 ? 'Direct' : `${path.length} hops`}
            </small>
          </summary>
          <button className="impact-focus" onClick={() => onFocus(id)}>
            <Focus size={12} /> Locate on map
          </button>
          <ol>
            {path.map((edge) => (
              <li key={edge.id}>
                {files.get(edge.source)?.url ? (
                  <a
                    href={`${files.get(edge.source)!.url}#L${edge.line}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {edge.source}:L{edge.line} <ArrowUpRight size={11} />
                  </a>
                ) : (
                  <span>
                    {edge.source}:L{edge.line}
                  </span>
                )}
                <small>
                  {edge.typeOnly ? 'imports a type from' : 'imports / references'} → {edge.target}
                </small>
              </li>
            ))}
          </ol>
        </details>
      ))}
      {analysis.stats.unresolved > 0 && (
        <p className="impact-help">
          {analysis.stats.unresolved} unresolved reference(s) are not included. See the analysis
          notes for coverage limits.
        </p>
      )}
    </section>
  );
}
