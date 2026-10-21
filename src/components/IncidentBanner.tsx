import React from 'react';
import { AlertTriangle, Eye, GitBranch, HelpCircle, X } from 'lucide-react';
import { SCENARIOS } from '../simulation/scenarios';
import { SimulationState } from '../types/simulation';

interface IncidentBannerProps {
  state: SimulationState;
  showHint: boolean;
  onToggleHint: () => void;
}

export const IncidentBanner: React.FC<IncidentBannerProps> = ({
  state,
  showHint,
  onToggleHint
}) => {
  const scenario = SCENARIOS[state.scenarioId];

  const isCritical = state.phase === 'C' || state.stability < 45;
  const isRecovering = state.phase === 'D' || state.stability >= 78;

  const bannerBorder = isRecovering
    ? 'border-emerald-500/50 bg-emerald-950/25'
    : isCritical
    ? 'border-rose-500/70 bg-rose-950/35'
    : 'border-amber-500/50 bg-amber-950/25';

  return (
    <section
      aria-label="Active Incident Diagnostic Banner"
      className={`rounded-xl border px-3.5 py-3 transition-colors space-y-2.5 ${bannerBorder}`}
    >
      {/* Top Row: Alert Headline + Optional Hint Button */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <AlertTriangle
            className={`w-5 h-5 shrink-0 ${
              isRecovering
                ? 'text-emerald-400'
                : isCritical
                ? 'text-rose-400'
                : 'text-amber-400'
            }`}
          />
          <span className="font-mono text-xs font-extrabold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-950/90 text-white border border-slate-700 shrink-0">
            {scenario.code}: {scenario.title}
          </span>
          <p className="font-mono text-xs sm:text-sm font-bold text-white truncate">
            {scenario.alertHeadline}
          </p>
        </div>

        <button
          type="button"
          onClick={onToggleHint}
          aria-expanded={showHint}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950/90 hover:bg-slate-900 border border-cyan-500/40 text-cyan-300 font-mono text-xs font-bold cursor-pointer focus:outline-none focus:ring-2 focus:ring-cyan-400 shrink-0"
        >
          <HelpCircle className="w-3.5 h-3.5 text-cyan-400" />
          <span>{showHint ? 'Hide Tactical Hint' : 'Need a Hint?'}</span>
        </button>
      </div>

      {/* Diagnostic Clues Strip: Separates Symptoms, Likely Cause Chain, and Live Priority Risk */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
        <div className="bg-slate-950/75 border border-slate-800/90 rounded-lg p-2.5">
          <div className="flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase text-amber-300 mb-0.5">
            <Eye className="w-3.5 h-3.5 shrink-0" />
            <span>1. Observable Symptoms</span>
          </div>
          <p className="text-slate-200 leading-snug">{state.symptomText}</p>
        </div>

        <div className="bg-slate-950/75 border border-slate-800/90 rounded-lg p-2.5">
          <div className="flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase text-cyan-300 mb-0.5">
            <GitBranch className="w-3.5 h-3.5 shrink-0" />
            <span>2. Dependency Chain (Likely Cause)</span>
          </div>
          <p className="font-mono text-[11px] text-slate-200 leading-snug">
            {state.likelyCauseText}
          </p>
        </div>

        <div className="bg-slate-950/75 border border-slate-800/90 rounded-lg p-2.5">
          <div className="flex items-center gap-1.5 font-mono text-[11px] font-bold uppercase text-rose-300 mb-0.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>3. Current Priority Risk</span>
          </div>
          <p className="text-slate-100 font-medium leading-snug">
            {state.currentRiskText}
          </p>
        </div>
      </div>

      {/* Optional On-Call Advisor Hint (Collapsed by default so clues come first) */}
      {showHint && (
        <div className="flex items-start justify-between gap-2 bg-slate-950/95 border border-cyan-500/50 rounded-lg px-3 py-2 text-xs text-cyan-100">
          <div className="flex items-start gap-2">
            <HelpCircle className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-mono font-bold text-cyan-300 block text-[11px]">
                ON-CALL ADVISOR SPOILER HINT:
              </span>
              <span className="text-slate-200 leading-snug">
                {state.hintText}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onToggleHint}
            className="text-slate-400 hover:text-white p-1 rounded focus:outline-none focus:ring-2 focus:ring-cyan-400"
            aria-label="Close tactical hint"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </section>
  );
};

