import React from 'react';
import { Clock, Layers, ShieldCheck } from 'lucide-react';
import { CONFIRMATION_TICKS_REQUIRED, SCENARIOS } from '../simulation/scenarios';
import { SimulationState } from '../types/simulation';

interface GameHeaderProps {
  state: SimulationState;
  onAbortToStart: () => void;
}

export const GameHeader: React.FC<GameHeaderProps> = ({
  state,
  onAbortToStart
}) => {
  const scenario = SCENARIOS[state.scenarioId];

  const stabilityColor =
    state.stability >= 78
      ? 'text-emerald-400'
      : state.stability >= 48
      ? 'text-amber-400'
      : 'text-rose-400';

  const stabilityBarColor =
    state.stability >= 78
      ? 'bg-emerald-500'
      : state.stability >= 48
      ? 'bg-amber-500'
      : 'bg-rose-500';

  const phaseLabel =
    state.phase === 'A'
      ? 'PHASE A: DETECTION'
      : state.phase === 'B'
      ? 'PHASE B: DEGRADATION'
      : state.phase === 'C'
      ? 'PHASE C: CASCADING FAILURE'
      : 'PHASE D: RECOVERY';

  const phaseBadgeStyle =
    state.phase === 'C'
      ? 'bg-rose-950/90 text-rose-300 border-rose-500/60'
      : state.phase === 'B'
      ? 'bg-amber-950/80 text-amber-300 border-amber-500/50'
      : state.phase === 'D'
      ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/50'
      : 'bg-slate-900 text-cyan-300 border-cyan-500/40';

  return (
    <header className="bg-slate-900/95 border-b border-slate-800 px-3 sm:px-5 py-2.5 sticky top-0 z-30 backdrop-blur-md">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2 sm:gap-4">
        {/* Left: Brand + Active Scenario */}
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={onAbortToStart}
            className="text-xs font-mono font-bold px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 shrink-0 focus:outline-none focus:ring-2 focus:ring-cyan-400"
            title="Return to Start Screen"
          >
            &larr; BRIEFING
          </button>

          <div className="truncate">
            <div className="flex items-center gap-2">
              <span className="font-mono font-black text-xs sm:text-sm text-white tracking-tight">
                PRODUCTION PANIC
              </span>
              <span className="hidden md:inline-block text-slate-600">|</span>
              <span className="hidden md:inline-block font-mono text-xs text-cyan-400 font-semibold truncate">
                {scenario.code}: {scenario.title}
              </span>
            </div>
          </div>

          <span
            className={`hidden sm:inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono font-bold border ${phaseBadgeStyle}`}
          >
            {phaseLabel}
          </span>
        </div>

        {/* Center/Right: Mitigation Slots + SLA Lock + Stability + Countdown */}
        <div className="flex items-center gap-2.5 sm:gap-4 ml-auto">
          {/* Active Mitigation Capacity Pill */}
          <div
            className={`hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full border font-mono text-xs ${
              state.activeMitigationsCount >= state.maxMitigationSlots
                ? 'bg-amber-950/80 border-amber-500/50 text-amber-300'
                : 'bg-slate-950 border-slate-800 text-slate-300'
            }`}
            title="Maximum 2 temporary mitigations ([1]-[4]) can be active simultaneously"
          >
            <Layers className="w-3.5 h-3.5 text-cyan-400" />
            <span>
              MITIGATION SLOTS: {state.activeMitigationsCount}/
              {state.maxMitigationSlots}
            </span>
          </div>

          {/* Confirmation streak pill when close to Full Recovery */}
          {state.highStabilityStreak > 0 && (
            <div
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950/90 border border-emerald-500/50 text-emerald-300 font-mono text-xs"
              aria-live="polite"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>
                SLA LOCK: {state.highStabilityStreak}/
                {CONFIRMATION_TICKS_REQUIRED}s
              </span>
            </div>
          )}

          {/* System Stability Gauge */}
          <div className="flex flex-col min-w-[120px] sm:min-w-[160px]">
            <div className="flex items-center justify-between text-xs font-mono mb-1">
              <span className="text-slate-400 uppercase text-[10px] sm:text-xs">
                Stability
              </span>
              <span className={`font-extrabold ${stabilityColor}`}>
                {Math.round(state.stability)}%
              </span>
            </div>
            <div
              className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800"
              role="progressbar"
              aria-valuenow={Math.round(state.stability)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="System Stability"
            >
              <div
                className={`h-full transition-all duration-300 ${stabilityBarColor}`}
                style={{ width: `${Math.round(state.stability)}%` }}
              />
            </div>
          </div>

          {/* 60-Second Incident Countdown */}
          <div
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-mono font-black text-base sm:text-xl shrink-0 ${
              state.timeRemaining <= 15
                ? 'bg-rose-950/90 border-rose-500/70 text-rose-300'
                : 'bg-slate-950 border-slate-700 text-white'
            }`}
            aria-label={`Remaining incident time ${state.timeRemaining} seconds`}
          >
            <Clock className="w-4 h-4 text-cyan-400 shrink-0" />
            <span>00:{String(state.timeRemaining).padStart(2, '0')}</span>
          </div>
        </div>
      </div>
    </header>
  );
};

