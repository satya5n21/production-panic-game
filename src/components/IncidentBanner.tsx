import React from 'react';
import { AlertTriangle, HelpCircle, X } from 'lucide-react';
import { SCENARIOS } from '../simulation/scenarios';
import { SimulationState } from '../types/simulation';

interface IncidentBannerProps {
    state: SimulationState;
    showHint: boolean;
    onDismissHint: () => void;
}

export const IncidentBanner: React.FC<IncidentBannerProps> = ({
    state,
    showHint,
    onDismissHint
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
            aria-label="Active Incident Alert"
            className={`rounded-xl border px-3.5 py-2.5 transition-colors ${bannerBorder}`}
        >
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2">
                <div className="flex items-start gap-2.5 min-w-0">
                    <AlertTriangle
                        className={`w-5 h-5 shrink-0 mt-0.5 ${isRecovering
                                ? 'text-emerald-400'
                                : isCritical
                                    ? 'text-rose-400'
                                    : 'text-amber-400'
                            }`}
                    />
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-950/90 text-white border border-slate-700">
                                {scenario.code}: {scenario.title}
                            </span>
                            <p className="font-mono text-xs sm:text-sm font-bold text-white truncate">
                                {scenario.alertHeadline}
                            </p>
                        </div>
                        <p className="text-xs text-slate-200 mt-1">
                            <span className="font-mono font-semibold text-cyan-300">
                                HIGHEST PRIORITY RISK:{' '}
                            </span>
                            {state.currentRiskText}
                        </p>
                    </div>
                </div>

                {/* Dismissible Onboarding Hint */}
                {showHint && (
                    <div className="flex items-start justify-between gap-2 bg-slate-950/90 border border-cyan-500/40 rounded-lg px-3 py-2 text-xs text-cyan-100 lg:max-w-md shrink-0">
                        <div className="flex items-start gap-2">
                            <HelpCircle className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                            <div>
                                <span className="font-mono font-bold text-cyan-300 block text-[11px]">
                                    ON-CALL ADVISOR TIP:
                                </span>
                                <span className="text-slate-300 leading-snug">
                                    {state.hintText}
                                </span>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={onDismissHint}
                            className="text-slate-400 hover:text-white p-1 rounded focus:outline-none focus:ring-2 focus:ring-cyan-400"
                            aria-label="Dismiss hint"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>
                )}
            </div>
        </section>
    );
};