import React, { useState } from 'react';
import {
    CheckCircle2,
    Compass,
    Play,
    Share2,
    Terminal,
    Trophy,
    Wrench,
    XCircle
} from 'lucide-react';
import { SCENARIOS, TOTAL_INCIDENT_SECONDS } from '../simulation/scenarios';
import {
    buildScoreAndReplayGuidance,
    calculateScore,
    formatShareSummary
} from '../simulation/scoring';
import { SimulationState } from '../types/simulation';

interface ResultScreenProps {
    state: SimulationState;
    bestScore: number;
    onPlayAgain: () => void;
    onBackToBriefing: () => void;
}

export const ResultScreen: React.FC<ResultScreenProps> = ({
    state,
    bestScore,
    onPlayAgain,
    onBackToBriefing
}) => {
    const [copiedState, setCopiedState] = useState<'IDLE' | 'COPIED' | 'ERROR'>(
        'IDLE'
    );

    const scenario = SCENARIOS[state.scenarioId];
    const score = calculateScore(state);
    const guidance = buildScoreAndReplayGuidance(state, score);

    const tierMeta = {
        FULL_RECOVERY: {
            title: 'FULL RECOVERY - SLA RESTORED',
            subtitle:
                'You diagnosed the root cause, contained cascading pressure, and stabilized production.',
            badgeBg: 'bg-emerald-950/90 border-emerald-500 text-emerald-300',
            accentText: 'text-emerald-400'
        },
        INCIDENT_CONTAINED: {
            title: 'INCIDENT CONTAINED',
            subtitle:
                'You prevented a full cascade and kept core APIs alive, though minor degradation remained.',
            badgeBg: 'bg-cyan-950/90 border-cyan-500 text-cyan-300',
            accentText: 'text-cyan-400'
        },
        DEGRADED_SURVIVED: {
            title: 'DEGRADED BUT SURVIVED',
            subtitle:
                'Production stayed online until the clock expired, but customers experienced heavy latency and errors.',
            badgeBg: 'bg-amber-950/90 border-amber-500 text-amber-300',
            accentText: 'text-amber-400'
        },
        PRODUCTION_DOWN: {
            title: 'PRODUCTION DOWN - CASCADING OUTAGE',
            subtitle:
                'Unchecked dependency pressure triggered a total system collapse before containment.',
            badgeBg: 'bg-rose-950/90 border-rose-500 text-rose-300',
            accentText: 'text-rose-400'
        }
    }[state.resultTier || 'DEGRADED_SURVIVED'];

    const handleShare = async () => {
        const text = formatShareSummary(state, score);

        const copyWithLegacyApi = () => {
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.setAttribute('readonly', '');
            textArea.style.position = 'fixed';
            textArea.style.opacity = '0';
            document.body.appendChild(textArea);
            textArea.select();
            let copied = false;
            try {
                copied = document.execCommand('copy');
            } finally {
                document.body.removeChild(textArea);
            }
            if (!copied) throw new Error('Clipboard copy was rejected');
        };

        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                try {
                    await navigator.clipboard.writeText(text);
                } catch {
                    copyWithLegacyApi();
                }
            } else {
                copyWithLegacyApi();
            }
            setCopiedState('COPIED');
            setTimeout(() => setCopiedState('IDLE'), 2500);
        } catch {
            setCopiedState('ERROR');
            setTimeout(() => setCopiedState('IDLE'), 2500);
        }
    };

    return (
        <div className="min-h-screen bg-[#060911] text-slate-100 p-4 sm:p-6 md:p-8 flex flex-col justify-center">
            <div className="max-w-5xl w-full mx-auto bg-slate-900/85 border border-slate-800 rounded-2xl p-5 sm:p-8 shadow-2xl space-y-6">
                {/* Top Outcome Banner */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
                    <div className="space-y-2">
                        <div
                            className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border font-mono text-xs font-extrabold ${tierMeta.badgeBg}`}
                        >
                            <span>
                                {scenario.code} POSTMORTEM // {tierMeta.title}
                            </span>
                        </div>
                        <h1
                            className={`text-2xl sm:text-4xl font-black font-mono ${tierMeta.accentText}`}
                        >
                            {tierMeta.title}
                        </h1>
                        <p className="text-sm text-slate-300 max-w-2xl">
                            {tierMeta.subtitle}
                        </p>
                    </div>

                    {/* Total Score Box */}
                    <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 min-w-[210px] text-center">
                        <div className="text-xs font-mono uppercase text-slate-400">
                            INCIDENT SCORE
                        </div>
                        <div className="text-4xl font-mono font-black text-white mt-1">
                            {score.total}
                            <span className="text-base text-slate-500 font-normal">/1000</span>
                        </div>
                        <div className="mt-1.5 flex items-center justify-center gap-1 text-xs font-mono text-amber-400">
                            <Trophy className="w-3.5 h-3.5" />
                            <span>Personal Best: {Math.max(bestScore, score.total)}</span>
                        </div>
                    </div>
                </div>

                {/* Score Breakdown + Final Telemetry */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Score Breakdown & Explanation */}
                    <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-3">
                        <h2 className="font-mono text-xs uppercase tracking-wider text-slate-400 font-bold">
                            What Contributed to Your Score
                        </h2>
                        <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                            <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex justify-between">
                                <span className="text-slate-400">Final Stability:</span>
                                <span className="text-white font-bold">
                                    +{score.stabilityScore}/350
                                </span>
                            </div>
                            <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex justify-between">
                                <span className="text-slate-400">Avg Availability:</span>
                                <span className="text-white font-bold">
                                    +{score.availabilityScore}/300
                                </span>
                            </div>
                            <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex justify-between">
                                <span className="text-slate-400">Speed &amp; SLA Bonus:</span>
                                <span className="text-white font-bold">
                                    +{score.speedBonus}/200
                                </span>
                            </div>
                            <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex justify-between">
                                <span className="text-slate-400">Decision Quality:</span>
                                <span className="text-white font-bold">
                                    +{score.decisionScore}/150
                                </span>
                            </div>
                        </div>
                        <ul className="space-y-1 text-xs text-slate-300 font-mono pt-1 border-t border-slate-800/80">
                            {guidance.scoreContributors.map((line, i) => (
                                <li key={i} className="leading-snug">
                                    • {line}
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* Final System Telemetry Snapshot + Scenario-Specific Replay Advice */}
                    <div className="flex flex-col gap-4">
                        <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-2.5">
                            <h2 className="font-mono text-xs uppercase tracking-wider text-slate-400 font-bold">
                                Final System Metrics ({TOTAL_INCIDENT_SECONDS - state.timeRemaining}s
                                Elapsed)
                            </h2>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                                <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                                    <span className="text-slate-400 block text-[10px]">
                                        STABILITY
                                    </span>
                                    <span className="text-base font-bold text-white">
                                        {Math.round(state.stability)}%
                                    </span>
                                </div>
                                <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                                    <span className="text-slate-400 block text-[10px]">
                                        P99 LATENCY
                                    </span>
                                    <span className="text-base font-bold text-white">
                                        {state.latency}ms
                                    </span>
                                </div>
                                <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                                    <span className="text-slate-400 block text-[10px]">
                                        ERROR RATE
                                    </span>
                                    <span className="text-base font-bold text-white">
                                        {state.errorRate.toFixed(1)}%
                                    </span>
                                </div>
                                <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                                    <span className="text-slate-400 block text-[10px]">
                                        QUEUE DEPTH
                                    </span>
                                    <span className="text-base font-bold text-white">
                                        {state.queueDepth}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Scenario-Specific Replay Suggestion */}
                        <div className="bg-cyan-950/30 border border-cyan-500/50 rounded-xl p-4 space-y-1.5 flex-1">
                            <div className="flex items-center gap-2 text-cyan-300 font-mono text-xs font-extrabold uppercase">
                                <Compass className="w-4 h-4 shrink-0" />
                                <span>Tactical Advice for Your Next Run ({scenario.title})</span>
                            </div>
                            <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
                                {guidance.nextRunSuggestion}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Postmortem & Prevention */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-4 space-y-2">
                        <div className="flex items-center gap-2 text-cyan-400 font-mono text-xs font-bold uppercase">
                            <Terminal className="w-4 h-4" />
                            <span>Root Cause &amp; SRE Postmortem</span>
                        </div>
                        <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                            {scenario.postmortemSummary}
                        </p>
                    </div>

                    <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-4 space-y-2">
                        <div className="flex items-center gap-2 text-emerald-400 font-mono text-xs font-bold uppercase">
                            <Wrench className="w-4 h-4" />
                            <span>Action Item to Prevent Recurrence</span>
                        </div>
                        <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                            {scenario.preventionTip}
                        </p>
                    </div>
                </div>

                {/* Key Decisions Timeline */}
                <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4">
                    <h2 className="font-mono text-xs uppercase tracking-wider text-slate-400 font-bold mb-2.5">
                        Incident Decision Timeline ({state.decisions.length} actions taken)
                    </h2>

                    {state.decisions.length === 0 ? (
                        <p className="text-xs font-mono text-rose-300">
                            No recovery actions were executed during this incident. Passive
                            observation allowed cascading failure to progress unchecked.
                        </p>
                    ) : (
                        <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
                            {state.decisions.map((d, idx) => (
                                <div
                                    key={`${d.tick}-${idx}`}
                                    className="flex items-start gap-2.5 text-xs font-mono bg-slate-900/90 border border-slate-800 rounded-lg p-2.5"
                                >
                                    <span className="text-slate-400 shrink-0">
                                        T-{String(d.timeRemaining).padStart(2, '0')}s
                                    </span>
                                    {d.helpful ? (
                                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                                    ) : (
                                        <XCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                                    )}
                                    <div className="space-y-0.5">
                                        <div>
                                            <span className="font-bold text-white">{d.label}</span>
                                            <span className="text-slate-300 block sm:inline sm:ml-2">
                                                - {d.outcomeSummary}
                                            </span>
                                        </div>
                                        <div className="text-[11px] text-cyan-300/90">
                                            {d.metricDelta}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Action Buttons: Play Again, Share Result, Briefing */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                    <div className="flex flex-wrap items-center gap-3">
                        <button
                            type="button"
                            onClick={onPlayAgain}
                            className="inline-flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-mono font-extrabold text-sm sm:text-base shadow-[0_0_25px_rgba(16,185,129,0.35)] cursor-pointer focus:outline-none focus:ring-4 focus:ring-emerald-300 min-h-[48px]"
                        >
                            <Play className="w-4 h-4 fill-slate-950" />
                            <span>PLAY NEXT INCIDENT</span>
                        </button>

                        <button
                            type="button"
                            onClick={handleShare}
                            className="inline-flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 font-mono font-bold text-xs sm:text-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-cyan-400 min-h-[48px]"
                        >
                            <Share2 className="w-4 h-4 text-cyan-400" />
                            <span>
                                {copiedState === 'COPIED'
                                    ? 'COPIED TO CLIPBOARD!'
                                    : copiedState === 'ERROR'
                                        ? 'CLIPBOARD UNAVAILABLE'
                                        : 'SHARE RESULT'}
                            </span>
                        </button>
                    </div>

                    <button
                        type="button"
                        onClick={onBackToBriefing}
                        className="px-4 py-3 rounded-xl bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 font-mono text-xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-cyan-400 min-h-[48px]"
                    >
                        Change Scenario / Briefing
                    </button>
                </div>
            </div>
        </div>
    );
};
