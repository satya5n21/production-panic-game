import React from 'react';
import {
  BookOpen,
  CheckCircle2,
  Clock,
  MousePointer,
  Shield,
  Zap
} from 'lucide-react';

interface FirstRunGuideProps {
  onDismiss: () => void;
}

export const FirstRunGuide: React.FC<FirstRunGuideProps> = ({ onDismiss }) => {
  return (
    <section
      aria-label="First Run Quick Guide"
      className="bg-slate-900/95 border-2 border-cyan-500/70 rounded-xl p-3.5 sm:p-4 shadow-[0_0_30px_rgba(6,182,212,0.2)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-cyan-400 shrink-0" />
          <h2 className="font-mono text-xs sm:text-sm font-extrabold uppercase tracking-wider text-cyan-300">
            First-Run On-Call Guide (Timer Paused)
          </h2>
        </div>

        <button
          type="button"
          onClick={onDismiss}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-mono text-xs font-extrabold cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-300"
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Got It - Start 60s Timer</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 mt-3 text-xs">
        <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-2.5">
          <div className="flex items-center gap-1.5 font-mono font-bold text-white mb-1">
            <Clock className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span>1. 60s Timer &amp; SLA Lock</span>
          </div>
          <p className="text-slate-300 leading-snug">
            You have <strong>60 seconds</strong> to save prod. Hold{' '}
            <strong>Stability &ge; 84% for 5s</strong> for an early Full Recovery
            win, or survive the clock.
          </p>
        </div>

        <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-2.5">
          <div className="flex items-center gap-1.5 font-mono font-bold text-white mb-1">
            <MousePointer className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>2. Symptoms vs. Root Cause</span>
          </div>
          <p className="text-slate-300 leading-snug">
            Read the <strong>Symptoms</strong> banner and tap any of the{' '}
            <strong>6 service nodes</strong> to see which failing service is
            dragging down its neighbors.
          </p>
        </div>

        <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-2.5">
          <div className="flex items-center gap-1.5 font-mono font-bold text-white mb-1">
            <Zap className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            <span>3. Don&apos;t Button-Mash (2 Slots)</span>
          </div>
          <p className="text-slate-300 leading-snug">
            You have <strong>2 Active Mitigation Slots</strong> across controls{' '}
            <strong>[1]-[4]</strong> plus the root-cause fix <strong>[5]</strong>.
            Wrong actions hurt your metrics!
          </p>
        </div>

        <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-2.5">
          <div className="flex items-center gap-1.5 font-mono font-bold text-white mb-1">
            <Shield className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>4. Unclamp After Healing</span>
          </div>
          <p className="text-slate-300 leading-snug">
            Throttling or opening a Circuit Breaker protects backends, but remember
            to <strong>turn them off once healed</strong> so Stability can pass 84%.
          </p>
        </div>
      </div>
    </section>
  );
};

