import React from 'react';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Layers,
  RotateCcw,
  ShieldAlert,
  Sliders,
  Wrench,
  Zap
} from 'lucide-react';
import { SCENARIOS } from '../simulation/scenarios';
import { ActionId, SimulationState } from '../types/simulation';

interface RecoveryControlsProps {
  state: SimulationState;
  onAction: (actionId: ActionId) => void;
}

export const RecoveryControls: React.FC<RecoveryControlsProps> = ({
  state,
  onAction
}) => {
  const scenario = SCENARIOS[state.scenarioId];
  const latestDecision =
    state.decisions.length > 0
      ? state.decisions[state.decisions.length - 1]
      : null;

  const slotsFull = state.activeMitigationsCount >= state.maxMitigationSlots;

  const controls: Array<{
    id: ActionId;
    hotkey: string;
    title: string;
    activeBadge: string | null;
    description: string;
    tradeoff: string;
    isActive: boolean;
    consumesSlot: boolean;
    isContextual?: boolean;
    disabled?: boolean;
    icon: React.ReactNode;
  }> = [
    {
      id: 'THROTTLE_TRAFFIC',
      hotkey: '1',
      title: state.trafficThrottled
        ? 'Unthrottle Edge Traffic (Free 1 Slot)'
        : 'Throttle Incoming Traffic (-35% Load)',
      activeBadge: state.trafficThrottled ? 'SLOT ACTIVE (-35% LOAD)' : null,
      description:
        'Plain English: Turns away 35% of incoming requests at the front door so overloaded servers can breathe.',
      tradeoff: state.trafficThrottled
        ? 'Active Trade-off: Stability is capped at ~80% until you unthrottle traffic.'
        : 'Uses 1 Mitigation Slot • Caps max Stability at ~80% while active.',
      isActive: state.trafficThrottled,
      consumesSlot: true,
      icon: <Sliders className="w-4 h-4" />
    },
    {
      id: 'CIRCUIT_BREAKER',
      hotkey: '2',
      title: state.circuitBreakerOpen
        ? 'Close Circuit Breaker (Free 1 Slot)'
        : 'Enable Circuit Breaker',
      activeBadge: state.circuitBreakerOpen ? 'SLOT ACTIVE (OPEN)' : null,
      description:
        'Plain English: Temporarily stops calls to a failing cache or DB so the rest of the app stops hanging on timeouts.',
      tradeoff:
        state.scenarioId === 'QUEUE_MELTDOWN' && !state.circuitBreakerOpen
          ? 'Caution: Redis & PostgreSQL are healthy—opening the breaker here will reject valid customer requests!'
          : 'Uses 1 Mitigation Slot • Fast-fails ~3% of calls until closed.',
      isActive: state.circuitBreakerOpen,
      consumesSlot: true,
      icon: <ShieldAlert className="w-4 h-4" />
    },
    {
      id: 'SCALE_WORKERS',
      hotkey: '3',
      title: `Scale Workers (${state.workerScale}x -> ${
        state.workerScale === 1 ? '2x' : state.workerScale === 2 ? '3x' : '1x'
      })`,
      activeBadge:
        state.workerScale > 1
          ? `SLOT ACTIVE (${state.workerScale}x POOL)`
          : null,
      description:
        'Plain English: Adds more background job runners to drain a backed-up message queue faster.',
      tradeoff:
        state.scenarioId === 'DB_SATURATION'
          ? 'Caution: Extra workers add write lock contention to an already locked PostgreSQL DB!'
          : state.scenarioId === 'QUEUE_MELTDOWN' &&
            !state.contextualFixApplied
          ? 'Caution: Purge poison jobs to DLQ [5] first, or new workers will also stall!'
          : 'Uses 1 Mitigation Slot when >1x • Increases PostgreSQL write load.',
      isActive: state.workerScale > 1,
      consumesSlot: state.workerScale === 1,
      icon: <Layers className="w-4 h-4" />
    },
    {
      id: 'DISABLE_RETRIES',
      hotkey: '4',
      title: state.retriesDisabled
        ? 'Re-enable Auto Retries (Free 1 Slot)'
        : 'Disable Aggressive Retries',
      activeBadge: state.retriesDisabled
        ? 'SLOT ACTIVE (RETRIES OFF)'
        : `RETRY LOAD: ${state.retryAmplification.toFixed(1)}x`,
      description:
        'Plain English: Stops clients and workers from immediately re-sending failed requests during a retry storm.',
      tradeoff:
        state.retryAmplification < 1.75 && !state.retriesDisabled
          ? 'Note: Retry Amplification is currently low (<1.75x); disabling retries may drop brief glitches.'
          : 'Uses 1 Mitigation Slot • Halts retry amplification storms.',
      isActive: state.retriesDisabled,
      consumesSlot: true,
      icon: <RotateCcw className="w-4 h-4" />
    },
    {
      id: 'CONTEXTUAL_FIX',
      hotkey: '5',
      title: state.contextualFixApplied
        ? scenario.contextualActionActiveLabel
        : scenario.contextualActionLabel,
      activeBadge: state.contextualFixApplied
        ? `RECOVERING (${state.contextualFixProgress}%)`
        : 'ROOT-CAUSE FIX (FREE SLOT)',
      description: scenario.contextualActionDescription,
      tradeoff: state.contextualFixApplied
        ? 'Remediation active - pressure subsiding over 4 seconds.'
        : 'Permanent root-cause repair • Does NOT consume a Mitigation Slot.',
      isActive: state.contextualFixApplied,
      consumesSlot: false,
      isContextual: true,
      disabled: state.contextualFixApplied,
      icon: <Wrench className="w-4 h-4" />
    }
  ];

  return (
    <section
      aria-label="Incident Recovery Controls"
      className="bg-slate-900/85 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between gap-2.5"
    >
      {/* Header + Shared Mitigation Slot Budget */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-400" />
          <h2 className="font-mono text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-200">
            Recovery Controls
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`px-2 py-0.5 rounded font-mono text-[11px] font-bold border ${
              slotsFull
                ? 'bg-amber-950/90 border-amber-500/60 text-amber-300'
                : 'bg-slate-950 border-slate-700 text-cyan-300'
            }`}
          >
            Active Mitigations: {state.activeMitigationsCount}/
            {state.maxMitigationSlots} Slots
          </span>
        </div>
      </div>

      {/* Capacity Limit Warning Banner if player tried to mash a 3rd simultaneous mitigation */}
      {state.lastCapacityWarning && (
        <div
          role="alert"
          className="rounded-lg bg-amber-950/90 border border-amber-500/70 px-3 py-2 text-xs font-mono text-amber-200 flex items-start gap-2"
        >
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <span>{state.lastCapacityWarning}</span>
        </div>
      )}

      {/* Live Action Outcome & Trade-off Feedback Box (reuses state.decisions) */}
      {latestDecision ? (
        <div
          role="status"
          aria-live="polite"
          className={`rounded-xl p-2.5 border text-xs space-y-1 ${
            latestDecision.helpful
              ? 'bg-cyan-950/35 border-cyan-500/50 text-slate-100'
              : 'bg-amber-950/40 border-amber-500/60 text-amber-100'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-1 font-mono">
            <span className="font-extrabold text-cyan-300 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 shrink-0" />
              <span>
                LATEST CALL (T-{latestDecision.timeRemaining}s):{' '}
                {latestDecision.label}
              </span>
            </span>
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                latestDecision.helpful
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40'
                  : 'bg-amber-950 text-amber-300 border border-amber-500/40'
              }`}
            >
              {latestDecision.helpful
                ? `EFFECTIVE (+${latestDecision.scoreDelta} PTS)`
                : `MISMATCHED (${latestDecision.scoreDelta} PTS)`}
            </span>
          </div>
          <p className="text-slate-200 leading-snug">
            <strong className="font-mono text-slate-300">Immediate Effect:</strong>{' '}
            {latestDecision.immediateEffect}
          </p>
          <p className="font-mono text-[11px] text-emerald-300">
            Metric Shift: {latestDecision.metricDelta}
          </p>
          <p className="font-mono text-[11px] text-amber-300/95">
            Trade-off: {latestDecision.tradeoff}
          </p>
        </div>
      ) : (
        <div className="rounded-xl p-2.5 border border-slate-800 bg-slate-950/60 text-xs font-mono text-slate-400">
          You can run up to <strong>2 temporary mitigations ([1]-[4])</strong> at
          once alongside <strong>[5] Root-Cause Fix</strong>. Pick what matches
          the symptoms!
        </div>
      )}

      <div className="grid grid-cols-1 gap-2.5">
        {controls.map((ctrl) => {
          const cd = state.cooldowns[ctrl.id];
          const blockedBySlotCap =
            slotsFull && ctrl.consumesSlot && !ctrl.isActive;
          const isDisabled = Boolean(
            ctrl.disabled || cd > 0 || state.isFinished
          );

          let buttonStyle =
            'bg-slate-950/90 border-slate-700/90 hover:border-cyan-400/70 text-slate-100';
          if (ctrl.isContextual && !ctrl.isActive) {
            buttonStyle =
              'bg-emerald-950/50 border-emerald-500/70 hover:bg-emerald-900/50 text-emerald-100 shadow-[0_0_20px_rgba(16,185,129,0.18)]';
          } else if (ctrl.isActive) {
            buttonStyle = 'bg-cyan-950/50 border-cyan-400/70 text-cyan-100';
          } else if (blockedBySlotCap) {
            buttonStyle =
              'bg-slate-950/50 border-slate-800 text-slate-400 hover:border-amber-500/50';
          }

          return (
            <button
              key={ctrl.id}
              type="button"
              disabled={isDisabled}
              onClick={() => onAction(ctrl.id)}
              className={`relative w-full text-left rounded-xl p-3 border transition-all min-h-[60px] focus:outline-none focus:ring-2 focus:ring-cyan-400 ${buttonStyle} ${
                isDisabled && !ctrl.isActive
                  ? 'opacity-60 cursor-not-allowed'
                  : 'cursor-pointer active:scale-[0.99]'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded bg-slate-900 border border-slate-700 font-mono text-[11px] font-bold text-cyan-300 shrink-0">
                    {ctrl.hotkey}
                  </span>
                  <span className="text-cyan-400 shrink-0">{ctrl.icon}</span>
                  <span className="font-mono font-bold text-xs sm:text-sm text-white truncate">
                    {ctrl.title}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {cd > 0 && (
                    <span className="px-2 py-0.5 rounded bg-slate-900 border border-amber-500/50 font-mono text-[11px] font-bold text-amber-300">
                      {cd}s CD
                    </span>
                  )}
                  {blockedBySlotCap && cd === 0 && (
                    <span className="px-2 py-0.5 rounded bg-amber-950/90 border border-amber-500/40 font-mono text-[10px] font-bold text-amber-300">
                      SLOTS FULL (2/2)
                    </span>
                  )}
                  {ctrl.activeBadge && (
                    <span
                      className={`px-2 py-0.5 rounded font-mono text-[10px] font-extrabold border ${
                        ctrl.isContextual && !ctrl.isActive
                          ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                          : ctrl.isActive
                          ? 'bg-cyan-950 border-cyan-500/50 text-cyan-300'
                          : 'bg-rose-950/80 border-rose-500/40 text-rose-300'
                      }`}
                    >
                      {ctrl.activeBadge}
                    </span>
                  )}
                  {ctrl.isActive && (
                    <CheckCircle2 className="w-4 h-4 text-cyan-400" />
                  )}
                </div>
              </div>

              <p className="text-xs text-slate-300 mt-1 leading-snug">
                {ctrl.description}
              </p>
              <p className="text-[11px] font-mono text-amber-300/90 mt-1">
                {ctrl.tradeoff}
              </p>
            </button>
          );
        })}
      </div>
    </section>
  );
};

