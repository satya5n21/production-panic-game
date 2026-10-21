import React from 'react';
import {
  Activity,
  Cpu,
  Flame,
  Layers,
  Play,
  RotateCcw,
  ShieldAlert,
  Sliders,
  Trophy,
  Wrench
} from 'lucide-react';
import { SCENARIOS, SCENARIO_ORDER } from '../simulation/scenarios';
import { ScenarioId } from '../types/simulation';

interface StartScreenProps {
  bestScore: number;
  selectedScenario: ScenarioId | 'AUTO';
  onSelectScenario: (val: ScenarioId | 'AUTO') => void;
  reducedMotion: boolean;
  onToggleReducedMotion: () => void;
  onStartIncident: () => void;
}

export const StartScreen: React.FC<StartScreenProps> = ({
  bestScore,
  selectedScenario,
  onSelectScenario,
  reducedMotion,
  onToggleReducedMotion,
  onStartIncident
}) => {
  return (
    <div className="min-h-screen bg-[#060911] text-slate-100 flex flex-col justify-between p-4 sm:p-6 md:p-8 select-none relative overflow-x-hidden">
      {/* Subtle technical grid background */}
      <div
        className="pointer-events-none fixed inset-0 opacity-20"
        style={{
          backgroundImage:
            'radial-gradient(circle at 50% 15%, rgba(16, 185, 129, 0.14), transparent 55%), linear-gradient(to right, rgba(30, 41, 59, 0.35) 1px, transparent 1px), linear-gradient(to bottom, rgba(30, 41, 59, 0.35) 1px, transparent 1px)',
          backgroundSize: '100% 100%, 32px 32px, 32px 32px'
        }}
      />

      {/* Top Status Bar */}
      <header className="relative z-10 max-w-5xl w-full mx-auto flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-2.5 w-2.5 rounded-full bg-rose-500 animate-ping" />
          <span className="font-mono text-xs uppercase tracking-widest text-rose-400 font-semibold">
            SRE ON-CALL WAR ROOM // PAGERDUTY SEV-1 ACTIVE
          </span>
        </div>

        <div className="flex items-center gap-3">
          {bestScore > 0 && (
            <div className="flex items-center gap-1.5 bg-slate-900/90 border border-amber-500/30 px-3 py-1 rounded-full text-xs font-mono text-amber-300">
              <Trophy className="w-3.5 h-3.5 text-amber-400" />
              <span>BEST SCORE: {bestScore}/1000</span>
            </div>
          )}

          <button
            type="button"
            onClick={onToggleReducedMotion}
            className="text-xs font-mono px-2.5 py-1 rounded border border-slate-700 bg-slate-900/80 text-slate-300 hover:border-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400"
            aria-pressed={reducedMotion}
          >
            Motion: {reducedMotion ? 'Reduced' : 'Full'}
          </button>
        </div>
      </header>

      {/* Main Hero & Briefing */}
      <main className="relative z-10 max-w-5xl w-full mx-auto my-auto py-6 flex flex-col gap-6">
        <div className="bg-slate-900/75 border border-slate-800 rounded-2xl p-5 sm:p-8 shadow-2xl">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
            <div className="space-y-3 max-w-2xl">
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-rose-950/70 border border-rose-500/40 text-rose-300 font-mono text-xs">
                <Flame className="w-3.5 h-3.5 text-rose-400" />
                <span>03:14 AM ON-CALL ROTATION // NO SRE JARGON REQUIRED</span>
              </div>

              <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-white font-mono">
                PRODUCTION PANIC
              </h1>
              <p className="text-base sm:text-xl font-mono font-bold text-cyan-400 tracking-wide">
                60 SECONDS TO SAVE PROD
              </p>

              <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
                Production is failing. Read the symptoms, trace which service is
                dragging down its neighbors, and make the right calls. You
                cannot just mash every button—each mitigation carries a real
                trade-off.
              </p>
            </div>

            {/* Scenario selector + Primary CTA */}
            <div className="flex flex-col sm:flex-row lg:flex-col gap-3 min-w-[260px]">
              <button
                type="button"
                onClick={onStartIncident}
                className="group relative inline-flex items-center justify-center gap-3 px-6 py-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-slate-950 font-mono font-extrabold text-base sm:text-lg tracking-wide shadow-[0_0_30px_rgba(16,185,129,0.4)] transition-all cursor-pointer focus:outline-none focus:ring-4 focus:ring-emerald-300 min-h-[54px]"
              >
                <Play className="w-5 h-5 fill-slate-950" />
                <span>START INCIDENT</span>
              </button>

              <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3">
                <label
                  htmlFor="scenario-select"
                  className="block text-[11px] font-mono uppercase tracking-wider text-slate-400 mb-1.5"
                >
                  Incident Scenario Selection
                </label>
                <select
                  id="scenario-select"
                  value={selectedScenario}
                  onChange={(e) =>
                    onSelectScenario(e.target.value as ScenarioId | 'AUTO')
                  }
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-xs font-mono text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                >
                  <option value="AUTO">
                    Auto-Rotate Curated Scenarios (Recommended)
                  </option>
                  {SCENARIO_ORDER.map((id) => (
                    <option key={id} value={id}>
                      {SCENARIOS[id].code}: {SCENARIOS[id].title}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Objective & Win Condition Strip */}
          <div className="mt-6 pt-5 border-t border-slate-800/90 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="bg-slate-950/70 border border-slate-800/90 rounded-lg p-3 flex items-start gap-2.5">
              <Activity className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-mono font-bold text-slate-200 block">
                  1. SYMPTOMS -&gt; ROOT CAUSE
                </span>
                <span className="text-slate-400">
                  Follow the dependency arrows in the topology to see why a slow
                  cache, database, or queue is cascading.
                </span>
              </div>
            </div>
            <div className="bg-slate-950/70 border border-slate-800/90 rounded-lg p-3 flex items-start gap-2.5">
              <Wrench className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-mono font-bold text-slate-200 block">
                  2. 2 ACTIVE MITIGATION SLOTS
                </span>
                <span className="text-slate-400">
                  You can run at most <strong>2 temporary mitigations</strong> at
                  once alongside your <strong>[5] Root-Cause Fix</strong>. Choose
                  what fits the symptom!
                </span>
              </div>
            </div>
            <div className="bg-slate-950/70 border border-slate-800/90 rounded-lg p-3 flex items-start gap-2.5">
              <Trophy className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-mono font-bold text-slate-200 block">
                  3. RESTORE FULL TRAFFIC FOR SLA WIN
                </span>
                <span className="text-slate-400">
                  Emergency clamps (Throttle/Breaker) save you from collapse, but
                  lift them once healed to hit <strong>Stability &ge; 84%</strong>.
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 4 Core Controls Briefing in Plain Language */}
        <section aria-labelledby="controls-heading">
          <div className="flex items-center justify-between mb-3">
            <h2
              id="controls-heading"
              className="text-xs font-mono uppercase tracking-widest text-slate-400 font-semibold"
            >
              Your Incident Toolkit (Plain-Language Guide)
            </h2>
            <span className="text-[11px] font-mono text-slate-400 hidden sm:inline">
              Keyboard shortcuts [1] - [5] supported during incident
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-cyan-400 font-mono text-xs font-bold mb-1">
                  <span>[1] THROTTLE TRAFFIC</span>
                  <Sliders className="w-4 h-4" />
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  <strong>What it does:</strong> Turns away 35% of incoming
                  requests at the front door so overloaded servers can catch up.
                </p>
              </div>
              <div className="mt-2.5 pt-2 border-t border-slate-800/80 text-[11px] font-mono text-amber-300/90">
                Trade-off: Caps Stability at ~80% until you unthrottle traffic.
              </div>
            </div>

            <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-cyan-400 font-mono text-xs font-bold mb-1">
                  <span>[2] CIRCUIT BREAKER</span>
                  <ShieldAlert className="w-4 h-4" />
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  <strong>What it does:</strong> Temporarily stops calls to a
                  dead cache or locked DB so the rest of the app stops hanging.
                </p>
              </div>
              <div className="mt-2.5 pt-2 border-t border-slate-800/80 text-[11px] font-mono text-amber-300/90">
                Trade-off: Rejects some requests; harmful if backends are healthy!
              </div>
            </div>

            <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-cyan-400 font-mono text-xs font-bold mb-1">
                  <span>[3] SCALE WORKERS</span>
                  <Layers className="w-4 h-4" />
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  <strong>What it does:</strong> Adds more background job
                  runners (1x -&gt; 2x -&gt; 3x) to drain a backed-up message queue.
                </p>
              </div>
              <div className="mt-2.5 pt-2 border-t border-slate-800/80 text-[11px] font-mono text-amber-300/90">
                Trade-off: More workers write more data to PostgreSQL!
              </div>
            </div>

            <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between text-cyan-400 font-mono text-xs font-bold mb-1">
                  <span>[4] DISABLE RETRIES</span>
                  <RotateCcw className="w-4 h-4" />
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  <strong>What it does:</strong> Stops clients from immediately
                  re-sending timed-out requests during a "retry storm."
                </p>
              </div>
              <div className="mt-2.5 pt-2 border-t border-slate-800/80 text-[11px] font-mono text-amber-300/90">
                Trade-off: Brief glitches fail immediately if no storm is active.
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="relative z-10 max-w-5xl w-full mx-auto pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-400">
        <div className="flex items-center gap-2">
          <Cpu className="w-3.5 h-3.5 text-emerald-400" />
          <span>
            6 Connected Services: Gateway • Node.js API • Redis • PostgreSQL •
            Queue • Workers
          </span>
        </div>
        <span>100% Client-Side Deterministic SRE Simulation</span>
      </footer>
    </div>
  );
};

