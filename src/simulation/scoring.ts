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
  const avgThroughput = state.throughputSum / ticksElapsed;

  // 1. Final Stability (0 - 350 pts)
  let stabilityScore = Math.round(
    (clamp(state.stability, 0, 100) / 100) * 350
  );
  if (tier === 'PRODUCTION_DOWN') {
    stabilityScore = Math.min(stabilityScore, 60);
  }

  // 2. Customer Experience & SLA Preservation (0 - 300 pts)
  // Combines average stability (210 pts) + preserved customer throughput (90 pts)
  const stabilityPart = (clamp(avgStability, 0, 100) / 100) * 210;
  const throughputRatio = clamp(avgThroughput / 1250, 0.2, 1.0);
  const throughputPart = throughputRatio * 90;
  const availabilityScore = Math.round(
    clamp(stabilityPart + throughputPart, 0, 300)
  );

  // 3. Speed & Containment bonus (0 - 200 pts)
  let speedBonus = 0;
  if (tier === 'FULL_RECOVERY') {
    speedBonus =
      110 + Math.round((state.timeRemaining / TOTAL_INCIDENT_SECONDS) * 90);
  } else if (tier === 'INCIDENT_CONTAINED') {
    speedBonus = 95;
  } else if (tier === 'DEGRADED_SURVIVED') {
    speedBonus = 40;
  }

  // 4. Tactical Precision & Decision Quality (0 - 150 pts)
  // Sums actual contextual score deltas from each decision rather than rewarding blind clicks
  const decisionNet = state.decisions.reduce((acc, d) => acc + d.scoreDelta, 0);
  const rawDecision = state.decisions.length === 0 ? 25 : 55 + decisionNet;
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
  const avgThroughput = Math.round(state.throughputSum / ticksElapsed);

  const scoreContributors: string[] = [
    `Final System Stability (${Math.round(state.stability)}%) awarded +${
      score.stabilityScore
    }/350 pts.`,
    `Customer Experience (avg stability ${avgStability}% & avg throughput ${avgThroughput.toLocaleString()} req/s) awarded +${
      score.availabilityScore
    }/300 pts.`,
    state.resultTier === 'FULL_RECOVERY'
      ? `Full SLA Recovery locked in with ${state.timeRemaining}s left on the clock (+${score.speedBonus}/200 speed pts).`
      : `Outcome tier (${state.resultTier || 'DEGRADED_SURVIVED'}) awarded +${
          score.speedBonus
        }/200 containment & survival pts.`,
    `Tactical Decision Precision (${state.meaningfulActionsCount} effective, ${state.harmfulActionsCount} mismatched/premature) awarded +${score.decisionScore}/150 pts.`
  ];

  const decisionAudit: string[] =
    state.decisions.length > 0
      ? state.decisions.map(
          (d) =>
            `[T-${String(d.timeRemaining).padStart(2, '0')}s] ${d.reason}`
        )
      : [
          'No recovery actions were executed (+25 base observation pts, 0 mitigation bonuses).'
        ];

  const usedContextual = state.contextualFixApplied;
  const everThrottled = state.decisions.some(
    (d) => d.actionId === 'THROTTLE_TRAFFIC'
  );
  const everOpenedBreaker = state.decisions.some(
    (d) => d.actionId === 'CIRCUIT_BREAKER'
  );
  const everDisabledRetries = state.decisions.some(
    (d) => d.actionId === 'DISABLE_RETRIES'
  );
  const harmfulWorkerScale = state.decisions.some(
    (d) => d.actionId === 'SCALE_WORKERS' && !d.helpful
  );
  const harmfulBreaker = state.decisions.some(
    (d) => d.actionId === 'CIRCUIT_BREAKER' && !d.helpful
  );

  let nextRunSuggestion = '';

  if (!usedContextual) {
    nextRunSuggestion = `You did not trigger [${scenario.contextualActionLabel}] (Key [5]). Temporary mitigations can slow down a cascade, but you must run the root-cause fix to clear the primary failure.`;
  } else if (state.scenarioId === 'CACHE_COLLAPSE') {
    if (
      (state.trafficThrottled || state.circuitBreakerOpen) &&
      state.redisAvailability >= 80 &&
      state.resultTier !== 'FULL_RECOVERY'
    ) {
      nextRunSuggestion =
        'Redis finished warming up (>80% Hit Ratio), but you left Traffic Throttling or the Circuit Breaker active until time expired, which capped Stability around 80%. Next run, close the breaker / unthrottle traffic once Redis recovers to cross 84% Stability for Full Recovery.';
    } else if (!everOpenedBreaker && !everThrottled) {
      nextRunSuggestion =
        'You restored Redis, but left PostgreSQL completely unshielded during the 4-second cache warm-up. Pair [5] Restore Redis with either [2] Enable Circuit Breaker or [1] Throttle Traffic to stop the cache-miss stampede.';
    } else if (harmfulWorkerScale) {
      nextRunSuggestion =
        'Avoid scaling Background Workers during Cache Collapse while PostgreSQL is overloaded (>68% load)—extra workers steal DB connections needed by the API.';
    } else {
      nextRunSuggestion =
        'Strong execution! To push your score even higher, open [2] Circuit Breaker + trigger [5] Restore Redis in the first 3 seconds, then close [2] right as Redis Hit Ratio crosses 80% to maximize average throughput.';
    }
  } else if (state.scenarioId === 'DB_SATURATION') {
    if (harmfulWorkerScale) {
      nextRunSuggestion =
        'Scaling Background Workers up during Database Saturation added write lock contention to PostgreSQL (-25 pts). Leave Workers at 1x in INC-509 and use your 2 slots on [4] Disable Retries and [1] Throttle Traffic.';
    } else if (!everDisabledRetries) {
      nextRunSuggestion =
        'Client retry storms (2.6x+) kept slamming PostgreSQL. Next run, activate [4] Disable Aggressive Retries right before running [5] Terminate Blocking DB Queries.';
    } else if (
      (state.trafficThrottled || state.circuitBreakerOpen) &&
      state.dbLoad < 60 &&
      state.resultTier !== 'FULL_RECOVERY'
    ) {
      nextRunSuggestion =
        'PostgreSQL load dropped to a safe level (<60%), but leaving Traffic Throttling or Circuit Breaker active capped your max Stability at ~80%. Lift your temporary clamp once DB load stabilizes to hit Full Recovery.';
    } else {
      nextRunSuggestion =
        'Well handled! For a peak score in Database Saturation, use [4] Disable Aggressive Retries + [5] Terminate Blocking DB Queries without throttling edge traffic (or unthrottle as soon as DB load drops below 55%).';
    }
  } else {
    // QUEUE_MELTDOWN
    if (harmfulBreaker) {
      nextRunSuggestion =
        'You opened the Circuit Breaker [2] during Queue Meltdown even though Redis and PostgreSQL were healthy, which caused unnecessary 5xx errors (-22 pts). Save your 2 mitigation slots for [3] Scale Workers (2x) and [4] Disable Retries.';
    } else if (harmfulWorkerScale) {
      nextRunSuggestion =
        'Wait to scale Background Workers until AFTER you trigger [5] Purge Poison Jobs to DLQ, and stop at 2x (3x overloads PostgreSQL unless traffic is throttled).';
    } else if (state.workerScale === 1 && state.queueDepth > 500) {
      nextRunSuggestion =
        'You isolated the poison jobs into the DLQ, but kept Workers at 1x concurrency so the 1,800-job backlog drained too slowly. Step Workers to 2x [3] right after purging to the DLQ.';
    } else if (
      state.trafficThrottled &&
      state.queueDepth < 500 &&
      state.resultTier !== 'FULL_RECOVERY'
    ) {
      nextRunSuggestion =
        'The queue backlog drained below 500 jobs, but Traffic Throttling stayed on and capped your Stability at ~80%. Unthrottle [1] once the queue is under control to lock in Full Recovery.';
    } else {
      nextRunSuggestion =
        'Clean queue recovery! Triggering [5] Purge Poison Jobs to DLQ on tick 1 followed immediately by [3] Scale Workers to 2x + [4] Disable Retries drains the backlog with maximum customer throughput.';
    }
  }

  return {
    scoreContributors,
    decisionAudit,
    nextRunSuggestion,
    alternativeStrategyTip: `${scenario.viableStrategies[0]} | Alternative: ${scenario.viableStrategies[1]}`
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
    `P99 Latency: ${state.latency}ms | Errors: ${state.errorRate.toFixed(
      1
    )}% | Time Left: ${state.timeRemaining}s`,
    `Can you save prod in 60 seconds?`
  ].join('\n');
}

