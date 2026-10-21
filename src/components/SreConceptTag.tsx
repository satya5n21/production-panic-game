import React, { useState } from 'react';
import { BookOpen, Info, X } from 'lucide-react';
import { SRE_CONCEPTS } from '../simulation/scenarios';
import { SreConceptId } from '../types/simulation';

interface SreConceptBarProps {
  conceptIds: SreConceptId[];
}

export const SreConceptBar: React.FC<SreConceptBarProps> = ({ conceptIds }) => {
  const [activeConcept, setActiveConcept] = useState<SreConceptId | null>(null);

  const selected = activeConcept ? SRE_CONCEPTS[activeConcept] : null;

  return (
    <div className="bg-slate-900/75 border border-slate-800/90 rounded-xl px-3 py-2 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-wider text-slate-400 mr-1">
            <BookOpen className="w-3.5 h-3.5 text-cyan-400" />
            <span>SRE Terms in This Incident (Tap to Explain):</span>
          </span>

          {conceptIds.map((id) => {
            const concept = SRE_CONCEPTS[id];
            const isOpen = activeConcept === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveConcept(isOpen ? null : id)}
                aria-expanded={isOpen}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono text-[11px] transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-cyan-400 ${
                  isOpen
                    ? 'bg-cyan-500 text-slate-950 font-bold'
                    : 'bg-slate-950/90 text-cyan-300 border border-cyan-500/30 hover:border-cyan-400'
                }`}
              >
                <Info className="w-3 h-3 shrink-0" />
                <span>{concept.term}</span>
              </button>
            );
          })}
        </div>
      </div>

      {selected && (
        <div
          role="region"
          aria-label={`Explanation for ${selected.term}`}
          className="mt-2 pt-2 border-t border-slate-800 flex items-start justify-between gap-3 text-xs bg-slate-950/80 rounded-lg p-2.5"
        >
          <div className="space-y-1">
            <div className="font-mono font-bold text-cyan-300">
              {selected.term} - Plain-Language Meaning:
            </div>
            <p className="text-slate-200 leading-relaxed">
              {selected.shortPlainLanguage}
            </p>
            <p className="text-emerald-300/95 font-mono text-[11px]">
              When to use: {selected.whenToUse}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setActiveConcept(null)}
            className="text-slate-400 hover:text-white p-1 rounded focus:outline-none focus:ring-2 focus:ring-cyan-400"
            aria-label="Close term explanation"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};

