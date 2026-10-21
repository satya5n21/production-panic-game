import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Terminal } from 'lucide-react';
import { LogEntry } from '../types/simulation';

interface IncidentEventLogProps {
    logs: LogEntry[];
}

export const IncidentEventLog: React.FC<IncidentEventLogProps> = ({ logs }) => {
    const [expandedMobile, setExpandedMobile] = useState(false);

    const visibleLogs = expandedMobile ? logs.slice(0, 12) : logs.slice(0, 5);

    const getBadgeStyle = (level: LogEntry['level']) => {
        switch (level) {
            case 'CRITICAL':
                return 'bg-rose-950 text-rose-300 border-rose-500/50';
            case 'WARN':
                return 'bg-amber-950 text-amber-300 border-amber-500/50';
            case 'ACTION':
                return 'bg-cyan-950 text-cyan-300 border-cyan-500/50';
            case 'RECOVERY':
                return 'bg-emerald-950 text-emerald-300 border-emerald-500/50';
            default:
                return 'bg-slate-800 text-slate-300 border-slate-700';
        }
    };

    return (
        <section
            aria-label="Incident Event Stream"
            className="bg-slate-900/85 border border-slate-800 rounded-xl p-3.5 flex flex-col"
        >
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-cyan-400" />
                    <h2 className="font-mono text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-200">
                        Live Incident Event Log
                    </h2>
                </div>

                <button
                    type="button"
                    onClick={() => setExpandedMobile((v) => !v)}
                    className="sm:hidden inline-flex items-center gap-1 text-xs font-mono text-cyan-400 px-2 py-1 rounded border border-slate-700 bg-slate-950"
                >
                    <span>{expandedMobile ? 'Compact' : 'Expand'}</span>
                    {expandedMobile ? (
                        <ChevronUp className="w-3.5 h-3.5" />
                    ) : (
                        <ChevronDown className="w-3.5 h-3.5" />
                    )}
                </button>
            </div>

            <div
                className="space-y-1.5 overflow-y-auto max-h-[210px] pr-1 font-mono text-xs"
                aria-live="polite"
            >
                {visibleLogs.map((entry) => (
                    <div
                        key={entry.id}
                        className="flex items-start gap-2 bg-slate-950/80 border border-slate-800/80 rounded-lg p-2"
                    >
                        <span className="text-slate-500 shrink-0 text-[11px]">
                            T-{String(entry.timeRemaining).padStart(2, '0')}s
                        </span>
                        <span
                            className={`px-1.5 py-0.2 rounded text-[10px] font-bold border shrink-0 ${getBadgeStyle(
                                entry.level
                            )}`}
                        >
                            {entry.level}
                        </span>
                        <span className="text-slate-200 leading-snug break-words">
                            {entry.message}
                        </span>
                    </div>
                ))}
            </div>
        </section>
    );
};