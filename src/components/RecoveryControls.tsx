import React from 'react';
import {
    Activity,
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

    const controls: Array<{
        id: ActionId;
        hotkey: string;
        title: string;
        activeBadge: string | null;
        description: string;
        tradeoff: string;
        isActive: boolean;
        isContextual?: boolean;
        disabled?: boolean;
        icon: React.ReactNode;
    }> = [
            {
                id: 'THROTTLE_TRAFFIC',
                hotkey: '1',
                title: state.trafficThrottled
                    ? 'Unthrottle Edge Traffic'
                    : 'Throttle Incoming Traffic',
                activeBadge: state.trafficThrottled ? 'ACTIVE (-35% LOAD)' : null,
                description:
                    'Sheds non-critical edge requests to reduce downstream pressure.',
                tradeoff: 'Trade-off: Lowers request throughput while active.',
                isActive: state.trafficThrottled,
                icon: <Sliders className="w-4 h-4" />
            },
            {
                id: 'CIRCUIT_BREAKER',
                hotkey: '2',
                title: state.circuitBreakerOpen
                    ? 'Close Circuit Breaker'
                    : 'Enable Circuit Breaker',
                activeBadge: state.circuitBreakerOpen ? 'OPEN (ISOLATING)' : null,
                description: 'Stops cascading failures from struggling dependencies.',
                tradeoff: 'Trade-off: Fast-fails a small % of dependent calls.',
                isActive: state.circuitBreakerOpen,
                icon: <ShieldAlert className="w-4 h-4" />
            },
            {
                id: 'SCALE_WORKERS',
                hotkey: '3',
                title: `Scale Workers (${state.workerScale}x -> ${state.workerScale === 1 ? '2x' : state.workerScale === 2 ? '3x' : '1x'
                    })`,
                activeBadge:
                    state.workerScale > 1 ? `SCALED: ${state.workerScale}x` : null,
                description:
                    'Adjusts background consumer concurrency to drain queue backlogs.',
                tradeoff: 'Trade-off: Higher worker scale increases PostgreSQL load.',
                isActive: state.workerScale > 1,
                icon: <Layers className="w-4 h-4" />
            },
            {
                id: 'DISABLE_RETRIES',
                hotkey: '4',
                title: state.retriesDisabled
                    ? 'Re-enable Auto Retries'
                    : 'Disable Aggressive Retries',
                activeBadge: state.retriesDisabled
                    ? 'RETRIES HALTED'
                    : `${state.retryAmplification.toFixed(1)}x AMPLIFICATION`,
                description:
                    'Halts client retry storms that multiply load on overloaded services.',
                tradeoff: 'Trade-off: Transient failed calls are not auto-retried.',
                isActive: state.retriesDisabled,
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
                    : 'ROOT-CAUSE REMEDIATION',
                description: scenario.contextualActionDescription,
                tradeoff: state.contextualFixApplied
                    ? 'Remediation active - pressure subsiding over several ticks.'
                    : 'Targeted root-cause action for this incident scenario.',
                isActive: state.contextualFixApplied,
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
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-400" />
                    <h2 className="font-mono text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-200">
                        Mitigation &amp; Recovery Controls
                    </h2>
                </div>
                <span className="font-mono text-[11px] text-slate-400">
                    Tap or press [1]-[5]
                </span>
            </div>

            {/* Live Action Outcome & Trade-off Feedback Box (reuses state.decisions) */}
            {latestDecision ? (
                <div
                    role="status"
                    aria-live="polite"
                    className={`rounded-xl p-2.5 border text-xs space-y-1 ${latestDecision.helpful
                            ? 'bg-cyan-950/35 border-cyan-500/50 text-slate-100'
                            : 'bg-amber-950/40 border-amber-500/60 text-amber-100'
                        }`}
                >
                    <div className="flex flex-wrap items-center justify-between gap-1 font-mono">
                        <span className="font-extrabold text-cyan-300 flex items-center gap-1.5">
                            <Activity className="w-3.5 h-3.5 shrink-0" />
                            <span>LATEST ACTION (T-{latestDecision.timeRemaining}s): {latestDecision.label}</span>
                        </span>
                        <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${latestDecision.helpful
                                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40'
                                    : 'bg-amber-950 text-amber-300 border border-amber-500/40'
                                }`}
                        >
                            {latestDecision.helpful ? 'EFFECTIVE' : 'TRADE-OFF WARNING'}
                        </span>
                    </div>
                    <p className="text-slate-200 leading-snug">
                        <strong className="font-mono text-slate-300">Effect:</strong>{' '}
                        {latestDecision.immediateEffect}
                    </p>
                    <p className="font-mono text-[11px] text-emerald-300">
                        Observable Metric Shift: {latestDecision.metricDelta}
                    </p>
                    <p className="font-mono text-[11px] text-amber-300/95">
                        {latestDecision.tradeoff}
                    </p>
                </div>
            ) : (
                <div className="rounded-xl p-2.5 border border-slate-800 bg-slate-950/60 text-xs font-mono text-slate-400">
                    Select a mitigation control below to view its immediate metric impact and operational trade-off.
                </div>
            )}

            <div className="grid grid-cols-1 gap-2.5">
                {controls.map((ctrl) => {
                    const cd = state.cooldowns[ctrl.id];
                    const isDisabled = Boolean(ctrl.disabled || cd > 0 || state.isFinished);

                    let buttonStyle =
                        'bg-slate-950/90 border-slate-700/90 hover:border-cyan-400/70 text-slate-100';
                    if (ctrl.isContextual && !ctrl.isActive) {
                        buttonStyle =
                            'bg-emerald-950/50 border-emerald-500/70 hover:bg-emerald-900/50 text-emerald-100 shadow-[0_0_20px_rgba(16,185,129,0.18)]';
                    } else if (ctrl.isActive) {
                        buttonStyle = 'bg-cyan-950/50 border-cyan-400/70 text-cyan-100';
                    }

                    return (
                        <button
                            key={ctrl.id}
                            type="button"
                            disabled={isDisabled}
                            onClick={() => onAction(ctrl.id)}
                            className={`relative w-full text-left rounded-xl p-3 border transition-all min-h-[60px] focus:outline-none focus:ring-2 focus:ring-cyan-400 ${buttonStyle} ${isDisabled && !ctrl.isActive
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
                                    {ctrl.activeBadge && (
                                        <span
                                            className={`px-2 py-0.5 rounded font-mono text-[10px] font-extrabold border ${ctrl.isContextual && !ctrl.isActive
                                                    ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                                                    : ctrl.isActive
                                                        ? 'bg-cyan-950 border-cyan-500/50 text-cyan-300'
                                                        : 'bg-rose-950/80 border-rose-500/40 text-rose-300'
                                                }`}
                                        >
                                            {ctrl.activeBadge}
                                        </span>
                                    )}
                                    {ctrl.isActive && <CheckCircle2 className="w-4 h-4 text-cyan-400" />}
                                </div>
                            </div>

                            <p className="text-xs text-slate-300 mt-1 leading-snug">
                                {ctrl.description}
                            </p>
                            <p className="text-[11px] font-mono text-slate-400 mt-1">
                                {ctrl.tradeoff}
                            </p>
                        </button>
                    );
                })}
            </div>
        </section>
    );
};