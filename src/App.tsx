import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FirstRunGuide } from './components/FirstRunGuide';
import { GameHeader } from './components/GameHeader';
import { IncidentBanner } from './components/IncidentBanner';
import { IncidentEventLog } from './components/IncidentEventLog';
import { MetricsPanel } from './components/MetricsPanel';
import { RecoveryControls } from './components/RecoveryControls';
import { ResultScreen } from './components/ResultScreen';
import { StartScreen } from './components/StartScreen';
import { SystemTopology } from './components/SystemTopology';
import {
    applyPlayerAction,
    createInitialSimulationState,
    stepSimulation
} from './simulation/engine';
import { SCENARIO_ORDER, TOTAL_INCIDENT_SECONDS } from './simulation/scenarios';
import { calculateScore } from './simulation/scoring';
import {
    ActionId,
    ScenarioId,
    ServiceId,
    SimulationState
} from './types/simulation';

const STORAGE_BEST_SCORE_KEY = 'production_panic_best_score_v1';
const STORAGE_MOTION_KEY = 'production_panic_reduced_motion_v1';

function readLocalNumber(key: string, fallback: number): number {
    try {
        const raw = window.localStorage.getItem(key);
        if (!raw) return fallback;
        const parsed = Number(raw);
        return Number.isFinite(parsed) ? parsed : fallback;
    } catch {
        return fallback;
    }
}

function writeLocalString(key: string, value: string): void {
    try {
        window.localStorage.setItem(key, value);
    } catch {
        // Graceful fallback if localStorage is blocked
    }
}

export function App() {
    const [screen, setScreen] = useState<'START' | 'PLAYING' | 'RESULT'>('START');
    const [selectedScenarioMode, setSelectedScenarioMode] = useState<
        ScenarioId | 'AUTO'
    >('AUTO');
    const scenarioRotationRef = useRef<number>(0);

    const [bestScore, setBestScore] = useState<number>(() =>
        readLocalNumber(STORAGE_BEST_SCORE_KEY, 0)
    );

    const [reducedMotion, setReducedMotion] = useState<boolean>(() => {
        try {
            const saved = window.localStorage.getItem(STORAGE_MOTION_KEY);
            if (saved !== null) return saved === 'true';
            return (
                window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
            );
        } catch {
            return false;
        }
    });

    // Show the briefing for every new incident, then hold the timer until dismissed.
    const [firstRunGuideDismissed, setFirstRunGuideDismissed] = useState(false);

    const [simState, setSimState] = useState<SimulationState>(() =>
        createInitialSimulationState('CACHE_COLLAPSE')
    );
    const [selectedService, setSelectedService] = useState<ServiceId>('redis');
    const [showHint, setShowHint] = useState<boolean>(true);

    // Wall-clock reference for throttling-resilient 60s countdown
    const incidentStartWallClockRef = useRef<number | null>(null);

    const handleToggleReducedMotion = useCallback(() => {
        setReducedMotion((prev) => {
            const next = !prev;
            writeLocalString(STORAGE_MOTION_KEY, String(next));
            return next;
        });
    }, []);

    const handleDismissFirstRunGuide = useCallback(() => {
        setFirstRunGuideDismissed(true);
        // Reset wall clock baseline when the user closes the guide so no time is lost
        incidentStartWallClockRef.current = Date.now();
    }, []);

    const startNewIncident = useCallback(() => {
        let nextScenario: ScenarioId;
        if (selectedScenarioMode === 'AUTO') {
            nextScenario =
                SCENARIO_ORDER[scenarioRotationRef.current % SCENARIO_ORDER.length];
            scenarioRotationRef.current += 1;
        } else {
            nextScenario = selectedScenarioMode;
        }

        const freshState = createInitialSimulationState(nextScenario);
        setSimState(freshState);
        setFirstRunGuideDismissed(false);
        incidentStartWallClockRef.current = Date.now();

        if (nextScenario === 'CACHE_COLLAPSE') {
            setSelectedService('redis');
        } else if (nextScenario === 'DB_SATURATION') {
            setSelectedService('postgres');
        } else {
            setSelectedService('workers');
        }

        setShowHint(true);
        setScreen('PLAYING');
    }, [selectedScenarioMode]);

    // Wall-clock resilient 60-second simulation timer
    useEffect(() => {
        if (screen !== 'PLAYING' || !firstRunGuideDismissed) {
            return;
        }

        if (incidentStartWallClockRef.current === null) {
            incidentStartWallClockRef.current = Date.now();
        }

        const syncWithWallClock = () => {
            if (incidentStartWallClockRef.current === null) return;
            const elapsedSeconds = Math.min(
                TOTAL_INCIDENT_SECONDS,
                Math.max(
                    0,
                    Math.floor((Date.now() - incidentStartWallClockRef.current) / 1000)
                )
            );

            setSimState((prev) => {
                if (prev.isFinished || elapsedSeconds <= prev.tick) {
                    return prev;
                }
                let next = prev;
                const stepsToAdvance = Math.min(
                    TOTAL_INCIDENT_SECONDS - prev.tick,
                    elapsedSeconds - prev.tick
                );
                for (let i = 0; i < stepsToAdvance; i++) {
                    if (next.isFinished) break;
                    next = stepSimulation(next);
                }
                return next;
            });
        };

        const intervalId = window.setInterval(syncWithWallClock, 250);
        const handleVisibilityOrFocus = () => {
            if (document.visibilityState === 'visible') {
                syncWithWallClock();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityOrFocus);
        window.addEventListener('focus', handleVisibilityOrFocus);

        return () => {
            window.clearInterval(intervalId);
            document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
            window.removeEventListener('focus', handleVisibilityOrFocus);
        };
    }, [screen, firstRunGuideDismissed]);

    // Transition to ResultScreen when incident finishes
    useEffect(() => {
        if (screen === 'PLAYING' && simState.isFinished) {
            const breakdown = calculateScore(simState);
            if (breakdown.total > bestScore) {
                setBestScore(breakdown.total);
                writeLocalString(STORAGE_BEST_SCORE_KEY, String(breakdown.total));
            }
            setScreen('RESULT');
        }
    }, [screen, simState, bestScore, firstRunGuideDismissed]);

    const handlePlayerAction = useCallback((actionId: ActionId) => {
        setSimState((prev) => applyPlayerAction(prev, actionId));
    }, []);

    // Keyboard shortcuts [1] - [5] during gameplay
    useEffect(() => {
        if (screen !== 'PLAYING' || !firstRunGuideDismissed) return;

        const onKeyDown = (e: KeyboardEvent) => {
            if (
                e.target instanceof HTMLInputElement ||
                e.target instanceof HTMLSelectElement
            ) {
                return;
            }
            if (e.key === '1') handlePlayerAction('THROTTLE_TRAFFIC');
            if (e.key === '2') handlePlayerAction('CIRCUIT_BREAKER');
            if (e.key === '3') handlePlayerAction('SCALE_WORKERS');
            if (e.key === '4') handlePlayerAction('DISABLE_RETRIES');
            if (e.key === '5') handlePlayerAction('CONTEXTUAL_FIX');
        };

        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [screen, firstRunGuideDismissed, handlePlayerAction]);

    if (screen === 'START') {
        return (
            <StartScreen
                bestScore={bestScore}
                selectedScenario={selectedScenarioMode}
                onSelectScenario={setSelectedScenarioMode}
                reducedMotion={reducedMotion}
                onToggleReducedMotion={handleToggleReducedMotion}
                onStartIncident={startNewIncident}
            />
        );
    }

    if (screen === 'RESULT') {
        return (
            <ResultScreen
                state={simState}
                bestScore={bestScore}
                onPlayAgain={startNewIncident}
                onBackToBriefing={() => setScreen('START')}
            />
        );
    }

    return (
        <div className="min-h-screen bg-[#060911] text-slate-100 flex flex-col select-none">
            <GameHeader
                state={simState}
                onAbortToStart={() => setScreen('START')}
            />

            <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-4 md:p-5 flex flex-col gap-3.5">
                {!firstRunGuideDismissed && (
                    <FirstRunGuide onDismiss={handleDismissFirstRunGuide} />
                )}

                <IncidentBanner
                    state={simState}
                    showHint={showHint}
                    onDismissHint={() => setShowHint(false)}
                />

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-start">
                    {/* Left 7 Columns on Desktop: System Topology + Telemetry Cards + Event Log */}
                    <div className="lg:col-span-7 flex flex-col gap-3.5">
                        <SystemTopology
                            state={simState}
                            selectedService={selectedService}
                            onSelectService={setSelectedService}
                            reducedMotion={reducedMotion}
                        />

                        <MetricsPanel state={simState} />

                        <div className="hidden lg:block">
                            <IncidentEventLog logs={simState.logs} />
                        </div>
                    </div>

                    {/* Right 5 Columns on Desktop: Recovery Controls + Mobile Event Log */}
                    <div className="lg:col-span-5 flex flex-col gap-3.5">
                        <RecoveryControls
                            state={simState}
                            onAction={handlePlayerAction}
                        />

                        <div className="lg:hidden">
                            <IncidentEventLog logs={simState.logs} />
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}

export default App;
