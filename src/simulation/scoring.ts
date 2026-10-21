import { SCENARIOS, TOTAL_INCIDENT_SECONDS } from './scenarios';
import {
    ReplayGuidance,
    ResultTier,
    ScoreBreakdown,
    SimulationState
} from '../types/simulation';

export function clamp(val: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, val));
}

export function evaluateFinalTier(state: SimulationState): ResultTier {
    if (state.stability <= 0) {
        return 'PRODUCTION_DOWN';
    }
    if (
        state.stability >= 82 &&
        state.errorRate < 6 &&
        Object.values(state.services).every((s) => s.status !== 'FAILED')
    ) {
        return 'FULL_RECOVERY';
    }
    if (state.stability >= 58 && state.errorRate < 16) {
        return 'INCIDENT_CONTAINED';
    }
    if (state.stability >= 25) {
        return 'DEGRADED_SURVIVED';
    }
    return 'PRODUCTION_DOWN';
}

export function calculateScore(state: SimulationState): ScoreBreakdown {
    const tier = state.resultTier || evaluateFinalTier(state);
    const ticksElapsed = Math.max(1, state.tick);
    const avgStability = state.stabilitySum / ticksElapsed;

    // 1. Final Stability (0 - 350 pts)
    let stabilityScore = Math.round((clamp(state.stability, 0, 100) / 100) * 350);
    if (tier === 'PRODUCTION_DOWN') {
        stabilityScore = Math.min(stabilityScore, 60);
    }

    // 2. Availability & SLA preservation during incident (0 - 300 pts)
    const availabilityScore = Math.round((clamp(avgStability, 0, 100) / 100) * 300);

    // 3. Speed & Containment bonus (0 - 200 pts)
    let speedBonus = 0;
    if (tier === 'FULL_RECOVERY') {
        speedBonus = 110 + Math.round((state.timeRemaining / TOTAL_INCIDENT_SECONDS) * 90);
    } else if (tier === 'INCIDENT_CONTAINED') {
        speedBonus = 95;
    } else if (tier === 'DEGRADED_SURVIVED') {
        speedBonus = 40;
    }

    // 4. Decision quality (0 - 150 pts)
    const rawDecision =
        60 +
        Math.min(3, state.meaningfulActionsCount) * 30 -
        state.harmfulActionsCount * 25;
    const decisionScore = clamp(rawDecision, 0, 150);

    const total = clamp(
        stabilityScore + availabilityScore + speedBonus + decisionScore,
        0,
        1000
    );

    return {
        total,
        stabilityScore,
        availabilityScore,
        speedBonus,
        decisionScore
    };
}

export function buildScoreAndReplayGuidance(
    state: SimulationState,
    score: ScoreBreakdown
): ReplayGuidance {
    const scenario = SCENARIOS[state.scenarioId];
    const ticksElapsed = Math.max(1, state.tick);
    const avgStability = Math.round(state.stabilitySum / ticksElapsed);

    const scoreContributors: string[] = [
        `Final Stability (${Math.round(state.stability)}%) contributed +${score.stabilityScore}/350 pts.`,
        `Average SLA Availability (${avgStability}% across ${ticksElapsed}s) contributed +${score.availabilityScore}/300 pts.`,
        state.resultTier === 'FULL_RECOVERY'
            ? `Early Full Recovery with ${state.timeRemaining}s remaining earned +${score.speedBonus}/200 speed bonus pts.`
            : `Containment tier (${state.resultTier || 'DEGRADED_SURVIVED'}) earned +${score.speedBonus}/200 speed & survival pts.`,
        `${state.meaningfulActionsCount} effective mitigation(s) and ${state.harmfulActionsCount} counterproductive action(s) yielded +${score.decisionScore}/150 decision pts.`
    ];

    const usedContextual = state.contextualFixApplied;
    const usedThrottle = state.decisions.some((d) => d.actionId === 'THROTTLE_TRAFFIC');
    const usedBreaker = state.decisions.some((d) => d.actionId === 'CIRCUIT_BREAKER');
    const usedDisableRetries = state.decisions.some((d) => d.actionId === 'DISABLE_RETRIES');
    const harmfulWorkerScale = state.decisions.some(
        (d) => d.actionId === 'SCALE_WORKERS' && !d.helpful
    );

    let nextRunSuggestion = '';

    if (!usedContextual) {
        nextRunSuggestion = `You never triggered [${scenario.contextualActionLabel}] (Key [5]). In ${scenario.title}, always execute the root-cause remediation early so primary service pressure can begin subsiding.`;
    } else if (state.scenarioId === 'CACHE_COLLAPSE') {
        if (!usedBreaker && !usedThrottle) {
            nextRunSuggestion =
                'While Redis warms back up over 4 ticks, uncached reads keep slamming PostgreSQL. Next run, pair [Restore & Warm Redis Cluster] with [Enable Circuit Breaker] or [Throttle Incoming Traffic] to shield PostgreSQL.';
        } else if (state.trafficThrottled && state.stability >= 75) {
            nextRunSuggestion =
                'You contained the cache miss storm well. For a higher score next run, unthrottle traffic once Redis Hit Ratio passes 80% to restore full throughput and lock in Full Recovery faster.';
        } else {
            nextRunSuggestion =
                'Trigger [Enable Circuit Breaker] and [Restore & Warm Redis Cluster] within the first 5 seconds to stop PostgreSQL fallback overload before Phase B degradation starts.';
        }
    } else if (state.scenarioId === 'DB_SATURATION') {
        if (harmfulWorkerScale) {
            nextRunSuggestion =
                'Scaling Background Workers up during Database Saturation added write lock contention to PostgreSQL (-25 decision pts). Keep Workers at 1x in INC-509 and focus on [Disable Aggressive Retries] + [Terminate Blocking DB Queries].';
        } else if (!usedDisableRetries) {
            nextRunSuggestion =
                'Client retries amplified PostgreSQL load up to 3.2x. In Database Saturation, hit [Disable Aggressive Retries] (Key [4]) immediately before clearing DB locks.';
        } else {
            nextRunSuggestion =
                'Combine [Disable Aggressive Retries], [Throttle Incoming Traffic], and [Terminate Blocking DB Queries] in the first 8 seconds to drop PostgreSQL load below 60% and secure the 5s SLA lock.';
        }
    } else {
        // QUEUE_MELTDOWN
        if (harmfulWorkerScale) {
            nextRunSuggestion =
                'Scaling Workers to 3x overloaded PostgreSQL connections. In Queue Meltdown, step Workers to 2x (not 3x) after running [Purge Poison Jobs to DLQ].';
        } else if (state.workerScale === 1) {
            nextRunSuggestion =
                'You purged poison jobs to the DLQ, but kept Workers at 1x concurrency so the 1,800-job backlog drained slowly. Scale Workers to 2x (Key [3]) right after purging to drain the queue twice as fast.';
        } else {
            nextRunSuggestion =
                'Execute [Purge Poison Jobs to DLQ] first, then [Disable Aggressive Retries] and [Scale Workers to 2x] to drain the queue below 300 jobs with time to spare.';
        }
    }

    return {
        scoreContributors,
        nextRunSuggestion
    };
}

export function formatShareSummary(
    state: SimulationState,
    score: ScoreBreakdown
): string {
    const scenario = SCENARIOS[state.scenarioId];
    const tierLabel =
        state.resultTier === 'FULL_RECOVERY'
            ? '[PASS] FULL RECOVERY (SLA RESTORED)'
            : state.resultTier === 'INCIDENT_CONTAINED'
                ? '[CONTAINED] INCIDENT CONTAINED'
                : state.resultTier === 'DEGRADED_SURVIVED'
                    ? '[WARN] DEGRADED BUT SURVIVED'
                    : '[FAIL] PRODUCTION DOWN';

    return [
        `PRODUCTION PANIC - ${scenario.code}: ${scenario.title}`,
        `Outcome: ${tierLabel}`,
        `Score: ${score.total}/1000 | Stability: ${Math.round(state.stability)}%`,
        `P99 Latency: ${state.latency}ms | Errors: ${state.errorRate.toFixed(1)}% | Time Left: ${state.timeRemaining}s`,
        `Can you save prod in 60 seconds?`
    ].join('\n');
}
