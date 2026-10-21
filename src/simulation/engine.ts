import {
  ActionId,
  EscalationPhase,
  ScenarioId,
  ServiceId,
  ServiceState,
  ServiceStatus,
  SimulationState
} from '../types/simulation';
import {
  CONFIRMATION_TICKS_REQUIRED,
  MAX_ACTIVE_MITIGATION_SLOTS,
  SCENARIOS,
  TOTAL_INCIDENT_SECONDS
} from './scenarios';
import { clamp, evaluateFinalTier } from './scoring';

export function countActiveMitigations(state: {
  trafficThrottled: boolean;
  circuitBreakerOpen: boolean;
  workerScale: 1 | 2 | 3;
  retriesDisabled: boolean;
}): number {
  let count = 0;
  if (state.trafficThrottled) count += 1;
  if (state.circuitBreakerOpen) count += 1;
  if (state.workerScale > 1) count += 1;
  if (state.retriesDisabled) count += 1;
  return count;
}

export function deriveServiceStatus(
  health: number,
  isRecovering: boolean
): ServiceStatus {
  if (health <= 28) return 'FAILED';
  if (isRecovering && health < 85) return 'RECOVERING';
  if (health < 76) return 'DEGRADED';
  return 'HEALTHY';
}

export function createInitialSimulationState(
  scenarioId: ScenarioId
): SimulationState {
  const config = SCENARIOS[scenarioId];

  const baseServices: Record<ServiceId, ServiceState> = {
    gateway: {
      id: 'gateway',
      name: 'API Gateway',
      shortName: 'Gateway',
      role: 'Edge Ingress & Rate Limiter',
      status: 'HEALTHY',
      health: 92,
      metricLabel: 'Ingress',
      metricValue: '1,240 req/s',
      detail: 'Routing external customer traffic cleanly'
    },
    api: {
      id: 'api',
      name: 'Node.js API',
      shortName: 'Node API',
      role: 'Core Application Service',
      status: 'DEGRADED',
      health: 70,
      metricLabel: 'P99 Latency',
      metricValue: '310 ms',
      detail: 'Elevated response times on upstream calls'
    },
    redis: {
      id: 'redis',
      name: 'Redis Cache',
      shortName: 'Redis',
      role: 'In-Memory Session & Read Cache',
      status: 'HEALTHY',
      health: 95,
      metricLabel: 'Hit Ratio',
      metricValue: '98.4%',
      detail: 'Sub-millisecond key lookups'
    },
    postgres: {
      id: 'postgres',
      name: 'PostgreSQL DB',
      shortName: 'PostgreSQL',
      role: 'Primary Transactional Store',
      status: 'HEALTHY',
      health: 86,
      metricLabel: 'Pool Load',
      metricValue: '42% used',
      detail: 'Transactional read/write pool nominal'
    },
    queue: {
      id: 'queue',
      name: 'Message Queue',
      shortName: 'Msg Queue',
      role: 'Async Event Broker',
      status: 'HEALTHY',
      health: 90,
      metricLabel: 'Backlog',
      metricValue: '140 msgs',
      detail: 'Publishing async events normally'
    },
    workers: {
      id: 'workers',
      name: 'Background Workers',
      shortName: 'Workers',
      role: 'Async Consumer Pool (1x)',
      status: 'HEALTHY',
      health: 90,
      metricLabel: 'Drain Rate',
      metricValue: '380 jobs/s',
      detail: 'Consumer threads healthy'
    }
  };

  let stability = 68;
  let throughput = 1180;
  let latency = 320;
  let errorRate = 7.8;
  let queueDepth = 220;
  let redisAvailability = 96;
  let dbLoad = 45;
  let workerEfficiency = 92;
  let retryAmplification = 1.4;
  let currentRiskText = '';
  let openingChatterSpeaker = '@pagerduty';
  let openingChatterMsg = '';

  if (scenarioId === 'CACHE_COLLAPSE') {
    redisAvailability = 8;
    dbLoad = 78;
    latency = 420;
    errorRate = 11.4;
    stability = 66;
    retryAmplification = 1.45;
    currentRiskText =
      'Uncached API reads are stampeding PostgreSQL - DB saturation imminent if Redis stays down.';
    openingChatterSpeaker = '@cache-ops';
    openingChatterMsg =
      'Redis primary just vanished after a bad TTL deploy! Every user profile lookup is hitting PostgreSQL raw.';

    baseServices.redis = {
      ...baseServices.redis,
      status: 'FAILED',
      health: 12,
      metricLabel: 'Hit Ratio',
      metricValue: '8.0% (MISS)',
      detail: 'Primary shard connection refused (ECONNREFUSED)'
    };
    baseServices.postgres = {
      ...baseServices.postgres,
      status: 'DEGRADED',
      health: 58,
      metricLabel: 'Pool Load',
      metricValue: '78% (SPIKE)',
      detail: 'Absorbing 1,100+ uncached fallback queries/sec'
    };
    baseServices.api = {
      ...baseServices.api,
      status: 'DEGRADED',
      health: 64,
      metricLabel: 'P99 Latency',
      metricValue: '420 ms',
      detail: 'Waiting on slow fallback DB reads'
    };
  } else if (scenarioId === 'DB_SATURATION') {
    redisAvailability = 94;
    dbLoad = 91;
    latency = 680;
    errorRate = 14.2;
    stability = 64;
    retryAmplification = 2.6;
    queueDepth = 410;
    currentRiskText =
      'Aggressive API retries (2.6x) are hammering locked PostgreSQL tables and starving threads.';
    openingChatterSpeaker = '@dba-oncall';
    openingChatterMsg =
      'pg_stat_activity is a wall of waiting locks, and the API client is retrying every timeout 3 times!';

    baseServices.postgres = {
      ...baseServices.postgres,
      status: 'FAILED',
      health: 24,
      metricLabel: 'Pool Load',
      metricValue: '91% (LOCKED)',
      detail: 'Row-level lock contention & exhausted connection pool'
    };
    baseServices.api = {
      ...baseServices.api,
      status: 'DEGRADED',
      health: 52,
      metricLabel: 'P99 Latency',
      metricValue: '680 ms',
      detail: 'Retry storm amplifying DB timeouts (2.6x load)'
    };
    baseServices.gateway = {
      ...baseServices.gateway,
      status: 'DEGRADED',
      health: 72,
      metricLabel: '5xx Rate',
      metricValue: '14.2% err',
      detail: 'Upstream Node.js API timing out on DB writes'
    };
  } else {
    // QUEUE_MELTDOWN
    redisAvailability = 96;
    dbLoad = 48;
    workerEfficiency = 18;
    queueDepth = 1840;
    latency = 350;
    errorRate = 8.8;
    stability = 67;
    retryAmplification = 2.1;
    currentRiskText =
      'Poison-pill webhook jobs are stalling Workers - Queue backlog is growing at +260 jobs/sec.';
    openingChatterSpeaker = '@platform-eng';
    openingChatterMsg =
      'Partner webhook sent malformed JSON. All 1x worker threads are stuck retrying the same poison jobs while the queue explodes!';

    baseServices.workers = {
      ...baseServices.workers,
      status: 'FAILED',
      health: 20,
      metricLabel: 'Drain Rate',
      metricValue: '35 jobs/s',
      detail: 'Consumer threads stuck in poison-message retry loop'
    };
    baseServices.queue = {
      ...baseServices.queue,
      status: 'DEGRADED',
      health: 46,
      metricLabel: 'Backlog',
      metricValue: '1,840 msgs',
      detail: 'High memory watermark warning - broker filling up'
    };
    baseServices.api = {
      ...baseServices.api,
      status: 'DEGRADED',
      health: 68,
      metricLabel: 'Publish Ack',
      metricValue: '350 ms',
      detail: 'Broker backpressure slowing async job publishing'
    };
  }

  return {
    scenarioId,
    scenarioTitle: config.title,
    scenarioSubtitle: config.subtitle,
    symptomText: config.symptomSummary,
    likelyCauseText: config.likelyCauseChain,
    currentRiskText,
    hintText: config.optionalHint,
    tick: 0,
    timeRemaining: TOTAL_INCIDENT_SECONDS,
    phase: 'A',

    stability,
    throughput,
    latency,
    errorRate,
    queueDepth,

    redisAvailability,
    dbLoad,
    workerEfficiency,
    retryAmplification,

    activeMitigationsCount: 0,
    maxMitigationSlots: MAX_ACTIVE_MITIGATION_SLOTS,
    trafficThrottled: false,
    circuitBreakerOpen: false,
    workerScale: 1,
    retriesDisabled: false,
    contextualFixApplied: false,
    contextualFixProgress: 0,

    cooldowns: {
      THROTTLE_TRAFFIC: 0,
      CIRCUIT_BREAKER: 0,
      SCALE_WORKERS: 0,
      DISABLE_RETRIES: 0,
      CONTEXTUAL_FIX: 0
    },

    highStabilityStreak: 0,
    stabilitySum: stability,
    throughputSum: throughput,
    throttledTicksCount: 0,
    peakErrorRate: errorRate,
    stabilizedAtTick: null,
    meaningfulActionsCount: 0,
    harmfulActionsCount: 0,
    firedChatterIds: [],
    lastCapacityWarning: null,

    services: baseServices,
    logs: [
      {
        id: 'init-1',
        tick: 0,
        timeRemaining: TOTAL_INCIDENT_SECONDS,
        level: 'CRITICAL',
        message: config.alertHeadline
      },
      {
        id: 'init-chatter',
        tick: 0,
        timeRemaining: TOTAL_INCIDENT_SECONDS,
        level: 'CHATTER',
        speaker: openingChatterSpeaker,
        message: openingChatterMsg
      }
    ],
    decisions: [],
    history: {
      stability: [stability],
      throughput: [throughput],
      latency: [latency],
      errorRate: [errorRate],
      queueDepth: [queueDepth]
    },

    isFinished: false,
    resultTier: null
  };
}

export function stepSimulation(prevState: SimulationState): SimulationState {
  if (prevState.isFinished) return prevState;

  const nextTick = Math.min(TOTAL_INCIDENT_SECONDS, prevState.tick + 1);
  const nextTimeRemaining = Math.max(0, TOTAL_INCIDENT_SECONDS - nextTick);

  // Decrement action cooldowns
  const nextCooldowns: Record<ActionId, number> = {
    THROTTLE_TRAFFIC: Math.max(0, prevState.cooldowns.THROTTLE_TRAFFIC - 1),
    CIRCUIT_BREAKER: Math.max(0, prevState.cooldowns.CIRCUIT_BREAKER - 1),
    SCALE_WORKERS: Math.max(0, prevState.cooldowns.SCALE_WORKERS - 1),
    DISABLE_RETRIES: Math.max(0, prevState.cooldowns.DISABLE_RETRIES - 1),
    CONTEXTUAL_FIX: Math.max(0, prevState.cooldowns.CONTEXTUAL_FIX - 1)
  };

  let {
    redisAvailability,
    dbLoad,
    workerEfficiency,
    retryAmplification,
    contextualFixProgress,
    queueDepth
  } = prevState;

  const firedChatterIds = [...prevState.firedChatterIds];
  const logs = [...prevState.logs];
  const pushLog = (
    level: LogEntry['level'],
    message: string,
    speaker?: string
  ) => {
    logs.unshift({
      id: `tick-${nextTick}-${logs.length}`,
      tick: nextTick,
      timeRemaining: nextTimeRemaining,
      level,
      speaker,
      message
    });
  };

  // Gradual warm-up when contextual fix is applied (takes ~4 ticks for full effect)
  if (prevState.contextualFixApplied && contextualFixProgress < 100) {
    // If DB or Queue is severely overloaded without any containment, root-cause recovery progresses slightly slower
    const stepSize =
      prevState.dbLoad > 88 &&
      !prevState.trafficThrottled &&
      !prevState.circuitBreakerOpen &&
      !prevState.retriesDisabled
        ? 20
        : 25;
    contextualFixProgress = Math.min(100, contextualFixProgress + stepSize);
    if (contextualFixProgress === 100) {
      const cfg = SCENARIOS[prevState.scenarioId];
      pushLog(
        'RECOVERY',
        `${cfg.contextualActionLabel} completed - primary bottleneck cleared.`
      );
    }
  }

  // Incoming traffic multiplier
  const trafficFactor = prevState.trafficThrottled ? 0.65 : 1.0;

  // Retry amplification dynamics
  if (prevState.retriesDisabled) {
    retryAmplification = Math.max(1.0, retryAmplification - 0.45);
  } else {
    const pressureTrigger =
      dbLoad > 75 || prevState.errorRate > 12 || queueDepth > 2000;
    if (pressureTrigger) {
      retryAmplification = Math.min(3.2, retryAmplification + 0.12);
    } else {
      retryAmplification = Math.max(1.1, retryAmplification - 0.08);
    }
  }

  let currentRiskText = prevState.currentRiskText;

  // Scenario-specific physics
  if (prevState.scenarioId === 'CACHE_COLLAPSE') {
    if (prevState.contextualFixApplied) {
      redisAvailability = clamp(
        redisAvailability + 18 + contextualFixProgress * 0.08,
        0,
        99
      );
    } else {
      redisAvailability = clamp(redisAvailability - 0.5, 4, 30);
    }

    const cacheMissRatio = (100 - redisAvailability) / 100;
    const circuitShield = prevState.circuitBreakerOpen ? 0.52 : 1.0;
    const workerDbPressure = (prevState.workerScale - 1) * 11;

    const targetDbLoad =
      28 +
      cacheMissRatio *
        74 *
        trafficFactor *
        circuitShield *
        (retryAmplification * 0.65) +
      workerDbPressure;

    dbLoad = clamp(dbLoad + (targetDbLoad - dbLoad) * 0.34, 18, 100);

    const queueDelta =
      dbLoad > 82
        ? (dbLoad - 78) * 6 * trafficFactor - prevState.workerScale * 30
        : -45 * prevState.workerScale;
    queueDepth = Math.round(clamp(queueDepth + queueDelta, 60, 3200));

    if (redisAvailability < 40) {
      currentRiskText = prevState.circuitBreakerOpen
        ? 'Circuit Breaker is shielding PostgreSQL, but Redis is still offline - run [5] Restore & Warm Redis Cluster!'
        : 'Redis cache misses are stampeding PostgreSQL. Restore Redis [5] and shield PostgreSQL with Circuit Breaker [2] or Throttle [1].';
    } else if (redisAvailability < 82 || dbLoad > 64) {
      currentRiskText =
        'Redis replica is warming hot keys - keep your protective mitigation active until Redis Hit Ratio > 80% and DB load drops.';
    } else if (prevState.trafficThrottled || prevState.circuitBreakerOpen) {
      currentRiskText =
        'Redis Hit Ratio is healthy (>80%)! Close Circuit Breaker / Unthrottle Traffic so 100% of customer requests can succeed for Full Recovery.';
    } else {
      currentRiskText =
        'Cache hit ratio restored and PostgreSQL load nominal. Hold steady for 5s SLA confirmation.';
    }
  } else if (prevState.scenarioId === 'DB_SATURATION') {
    const lockPenalty = prevState.contextualFixApplied
      ? Math.max(0, 38 - contextualFixProgress * 0.38)
      : 42;

    const workerContentionPenalty = (prevState.workerScale - 1) * 15;
    const circuitRelief = prevState.circuitBreakerOpen ? -12 : 0;

    const targetDbLoad =
      24 +
      lockPenalty +
      trafficFactor * 26 * retryAmplification +
      workerContentionPenalty +
      circuitRelief;

    dbLoad = clamp(dbLoad + (targetDbLoad - dbLoad) * 0.32, 16, 100);

    const queueDelta =
      dbLoad > 78
        ? (dbLoad - 72) * 8 * trafficFactor
        : -65 * prevState.workerScale;
    queueDepth = Math.round(clamp(queueDepth + queueDelta, 80, 3500));

    if (!prevState.retriesDisabled && retryAmplification > 1.8) {
      currentRiskText = `Retry storm (${retryAmplification.toFixed(
        1
      )}x) is multiplying load on locked PostgreSQL tables! Disable Aggressive Retries [4].`;
    } else if (!prevState.contextualFixApplied) {
      currentRiskText =
        'Stalled PostgreSQL locks are still blocking transactions - run [5] Terminate Blocking DB Queries.';
    } else if (prevState.workerScale > 1 && dbLoad > 60) {
      currentRiskText =
        'Scaled Background Workers are adding write lock contention to PostgreSQL - step Workers back to 1x [3].';
    } else if (dbLoad > 62) {
      currentRiskText =
        'PostgreSQL connection pool is draining backlog - hold steady until DB Load drops below 55%.';
    } else if (prevState.trafficThrottled || prevState.circuitBreakerOpen) {
      currentRiskText =
        'PostgreSQL locks cleared! Unthrottle Traffic / Close Circuit Breaker to restore full customer SLA and lock in Full Recovery.';
    } else {
      currentRiskText =
        'Database locks cleared and query latency nominal. Hold steady for 5s SLA confirmation.';
    }
  } else {
    // QUEUE_MELTDOWN
    if (prevState.contextualFixApplied) {
      workerEfficiency = clamp(
        workerEfficiency + 18 + contextualFixProgress * 0.1,
        15,
        98
      );
    } else {
      workerEfficiency = clamp(workerEfficiency - 0.8, 10, 32);
    }

    const incomingJobsPerSec =
      290 *
      trafficFactor *
      (prevState.retriesDisabled ? 0.72 : retryAmplification * 0.68);
    const drainCapacityPerSec =
      prevState.workerScale * 220 * (workerEfficiency / 100);

    const netQueueDelta = incomingJobsPerSec - drainCapacityPerSec;
    queueDepth = Math.round(clamp(queueDepth + netQueueDelta, 40, 4800));

    // Scaling workers before purging poison jobs still hammers DB metadata locks
    const prematureScalePenalty =
      !prevState.contextualFixApplied && prevState.workerScale > 1 ? 14 : 0;
    const workerDbLoad =
      (prevState.workerScale === 3 ? 36 : prevState.workerScale === 2 ? 14 : 4) +
      prematureScalePenalty;
    const queuePressureOnDb = queueDepth > 2400 ? 18 : 6;
    const targetDbLoad =
      32 + workerDbLoad + queuePressureOnDb * trafficFactor;

    dbLoad = clamp(dbLoad + (targetDbLoad - dbLoad) * 0.35, 20, 98);

    if (!prevState.contextualFixApplied) {
      currentRiskText =
        'Poison-pill webhook payloads are blocking Worker threads! Run [5] Purge Poison Jobs to DLQ so workers can drain the queue.';
    } else if (prevState.circuitBreakerOpen) {
      currentRiskText =
        'Circuit Breaker [2] is open even though Redis & PostgreSQL are healthy - close it to stop rejecting valid API calls!';
    } else if (queueDepth > 1100 && prevState.workerScale === 1) {
      currentRiskText =
        'DLQ routing is active, but 1x Workers are draining the backlog slowly - Scale Workers to 2x [3] and Disable Retries [4].';
    } else if (prevState.workerScale === 3 && dbLoad > 74) {
      currentRiskText =
        '3x Workers are overloading PostgreSQL connections! Step Workers down to 2x [3] or Throttle Traffic [1].';
    } else if (queueDepth > 480) {
      currentRiskText = `Workers are draining the queue (${queueDepth.toLocaleString()} jobs left) - keep 2x Workers active.`;
    } else if (prevState.trafficThrottled) {
      currentRiskText =
        'Queue backlog is under control! Unthrottle Traffic [1] so customer throughput returns to 100%.';
    } else {
      currentRiskText =
        'Queue backlog drained and worker pool healthy. Hold steady for 5s SLA confirmation.';
    }
  }

  // Coherent system-wide telemetry calculation
  const baseThroughput = prevState.trafficThrottled ? 880 : 1380;
  const circuitThroughputPenalty = prevState.circuitBreakerOpen ? 160 : 0;
  const dbBottleneckPenalty = dbLoad > 80 ? (dbLoad - 80) * 18 : 0;
  const latency = Math.round(
    clamp(
      75 +
        Math.pow(dbLoad / 10, 2.08) * 7.2 +
        (100 - redisAvailability) * 2.1 +
        (queueDepth > 1500 ? (queueDepth - 1500) * 0.14 : 0),
      65,
      1950
    )
  );

  // Circuit breaker & premature retry disable carry realistic request rejection trade-offs
  const unnecessaryBreakerErrorPenalty =
    prevState.circuitBreakerOpen &&
    (prevState.scenarioId === 'QUEUE_MELTDOWN' ||
      (redisAvailability > 80 && dbLoad < 65))
      ? 5.2
      : prevState.circuitBreakerOpen
      ? 2.8
      : 0;

  const prematureRetryDisablePenalty =
    prevState.retriesDisabled &&
    prevState.scenarioId === 'CACHE_COLLAPSE' &&
    redisAvailability < 50 &&
    !prevState.circuitBreakerOpen
      ? 2.2
      : 0;

  const rawErrorRate =
    (dbLoad > 72 ? (dbLoad - 72) * 0.72 : 0) +
    (100 - redisAvailability) *
      (prevState.circuitBreakerOpen ? 0.035 : 0.12) +
    (queueDepth > 1800 ? (queueDepth - 1800) * 0.008 : 0) +
    unnecessaryBreakerErrorPenalty +
    prematureRetryDisablePenalty +
    (retryAmplification > 1.8 ? (retryAmplification - 1.8) * 4.5 : 0);

  const errorRate = Number(clamp(rawErrorRate, 0.2, 65).toFixed(1));

  const throughput = Math.round(
    clamp(
      baseThroughput -
        circuitThroughputPenalty -
        dbBottleneckPenalty -
        errorRate * 9,
      180,
      1450
    )
  );

  // Individual service health scores (0 - 100)
  const dbHealth = clamp(108 - dbLoad * 1.05, 5, 100);
  const redisHealth = clamp(redisAvailability, 8, 100);
  const queueHealth = clamp(100 - (queueDepth / 3400) * 95, 8, 100);
  const workerHealth = clamp(
    workerEfficiency - (prevState.workerScale === 3 && dbLoad > 78 ? 22 : 0),
    10,
    100
  );
  const apiHealth = clamp(
    100 - errorRate * 2.2 - Math.max(0, latency - 180) * 0.055,
    8,
    100
  );
  // Throttling sheds 35% of customer traffic, so Gateway health reflects degraded customer availability while throttled
  const gatewayHealth = clamp(
    100 - errorRate * 1.6 - (prevState.trafficThrottled ? 22 : 0),
    15,
    100
  );

  let weightedHealth =
    apiHealth * 0.24 +
    dbHealth * 0.25 +
    redisHealth * 0.15 +
    queueHealth * 0.14 +
    workerHealth * 0.11 +
    gatewayHealth * 0.11;

  // Soft-cap overall stability when heavy customer-impacting clamps (Throttle or Open Circuit Breaker) remain active
  // This makes Throttle/Breaker great for surviving & containing, but requires lifting them once healthy for Full SLA Recovery (>= 84%).
  if (prevState.trafficThrottled) {
    weightedHealth = Math.min(weightedHealth, 80.5);
  }
  if (
    prevState.circuitBreakerOpen &&
    (prevState.scenarioId !== 'CACHE_COLLAPSE' || redisAvailability > 80)
  ) {
    weightedHealth = Math.min(weightedHealth, 81.0);
  }

  const maxStepDown = -3.8;
  const maxStepUp = 5.2;
  const stabilityDelta = clamp(
    (weightedHealth - prevState.stability) * 0.44,
    maxStepDown,
    maxStepUp
  );
  const stability = clamp(
    Number((prevState.stability + stabilityDelta).toFixed(1)),
    0,
    100
  );

  // Authored War-Room Chatter triggers (each fires at most once per run)
  const triggerChatterOnce = (
    id: string,
    speaker: string,
    message: string
  ) => {
    if (!firedChatterIds.includes(id)) {
      firedChatterIds.push(id);
      pushLog('CHATTER', message, speaker);
    }
  };

  if (nextTick >= 8 && prevState.decisions.length === 0) {
    triggerChatterOnce(
      'no-action-8s',
      '@incident-cmd',
      'On-call, are you paged in? Metrics are sliding toward Phase B degradation.'
    );
  }
  if (
    prevState.trafficThrottled &&
    prevState.throttledTicksCount >= 12 &&
    dbLoad < 58 &&
    queueDepth < 650
  ) {
    triggerChatterOnce(
      'throttle-too-long',
      '@support-lead',
      'Backends look calm now, but 35% of customers are still hitting HTTP 429 rate-limit pages. Can we unthrottle [1]?'
    );
  }
  if (
    prevState.scenarioId === 'CACHE_COLLAPSE' &&
    redisAvailability >= 85 &&
    prevState.circuitBreakerOpen
  ) {
    triggerChatterOnce(
      'redis-warm-breaker-open',
      '@cache-ops',
      'Redis hit ratio is back above 85%! Close the Circuit Breaker [2] so we stop serving fallback errors.'
    );
  }
  if (
    prevState.scenarioId === 'QUEUE_MELTDOWN' &&
    prevState.contextualFixApplied &&
    queueDepth < 500
  ) {
    triggerChatterOnce(
      'queue-drained',
      '@platform-eng',
      'DLQ isolated the poison webhooks and queue backlog is under 500 msgs. Almost out of the woods!'
    );
  }

  // Escalation Phase determination & milestone warnings
  let phase: EscalationPhase = 'A';
  if (
    prevState.contextualFixApplied &&
    stability >= 72 &&
    stability >= prevState.stability
  ) {
    phase = 'D';
  } else if (stability < 45 || dbLoad > 88 || queueDepth > 2800) {
    phase = 'C';
  } else if (nextTick >= 10 || stability < 62) {
    phase = 'B';
  }

  if (phase === 'B' && prevState.phase === 'A') {
    pushLog(
      'WARN',
      'Phase B Degradation: Primary bottleneck is spreading pressure across dependent services.'
    );
  } else if (phase === 'C' && prevState.phase !== 'C') {
    pushLog(
      'CRITICAL',
      `Phase C Cascading Failure: High latency (${latency}ms) and error rate (${errorRate}%) threatening SLA collapse!`
    );
  } else if (phase === 'D' && prevState.phase !== 'D') {
    pushLog(
      'RECOVERY',
      'Phase D Recovery Trajectory: Core dependencies stabilizing - restore full traffic and hold Stability >= 84% for 5s.'
    );
  }

  // Update individual service node cards
  const services: Record<ServiceId, ServiceState> = {
    gateway: {
      ...prevState.services.gateway,
      health: Math.round(gatewayHealth),
      status: deriveServiceStatus(gatewayHealth, prevState.trafficThrottled),
      metricLabel: prevState.trafficThrottled ? 'Throttled' : 'Ingress',
      metricValue: `${throughput.toLocaleString()} req/s`,
      detail: prevState.trafficThrottled
        ? 'Shedding 35% edge load (capping max SLA until lifted)'
        : errorRate > 12
        ? `Returning ${errorRate}% HTTP 502/504 errors`
        : 'Routing 100% customer edge traffic'
    },
    api: {
      ...prevState.services.api,
      health: Math.round(apiHealth),
      status: deriveServiceStatus(
        apiHealth,
        prevState.circuitBreakerOpen || prevState.retriesDisabled
      ),
      metricLabel: 'P99 Latency',
      metricValue: `${latency} ms`,
      detail: prevState.circuitBreakerOpen
        ? 'Circuit breaker OPEN - fast-failing calls to protect backends'
        : retryAmplification > 1.8
        ? `Retry storm multiplying load by ${retryAmplification.toFixed(1)}x`
        : 'Handling application requests'
    },
    redis: {
      ...prevState.services.redis,
      health: Math.round(redisHealth),
      status: deriveServiceStatus(
        redisHealth,
        prevState.scenarioId === 'CACHE_COLLAPSE' &&
          prevState.contextualFixApplied
      ),
      metricLabel: 'Hit Ratio',
      metricValue: `${Math.round(redisAvailability)}%`,
      detail:
        redisAvailability < 40
          ? 'Connection pool offline - 90%+ cache misses hitting DB'
          : redisAvailability < 85
          ? 'Standby promoted - warming hot cache keys'
          : 'In-memory cache serving hits < 2ms'
    },
    postgres: {
      ...prevState.services.postgres,
      health: Math.round(dbHealth),
      status: deriveServiceStatus(
        dbHealth,
        prevState.scenarioId === 'DB_SATURATION' &&
          prevState.contextualFixApplied
      ),
      metricLabel: 'DB Load',
      metricValue: `${Math.round(dbLoad)}%`,
      detail:
        dbLoad > 85
          ? 'Connection pool saturated & high query lock wait'
          : dbLoad > 65
          ? 'Elevated query load - draining active transactions'
          : 'Query execution & connection pool healthy'
    },
    queue: {
      ...prevState.services.queue,
      health: Math.round(queueHealth),
      status: deriveServiceStatus(
        queueHealth,
        queueDepth < prevState.queueDepth
      ),
      metricLabel: 'Backlog',
      metricValue: `${queueDepth.toLocaleString()} jobs`,
      detail:
        queueDepth > 1600
          ? 'Queue depth critical - producer backpressure active'
          : queueDepth > 600
          ? 'Backlog elevated but draining steadily'
          : 'Event queue depth nominal'
    },
    workers: {
      ...prevState.services.workers,
      role: `Async Consumer Pool (${prevState.workerScale}x)`,
      health: Math.round(workerHealth),
      status: deriveServiceStatus(
        workerHealth,
        prevState.scenarioId === 'QUEUE_MELTDOWN' &&
          prevState.contextualFixApplied
      ),
      metricLabel: `Pool (${prevState.workerScale}x)`,
      metricValue: `${Math.round(
        prevState.workerScale * 220 * (workerEfficiency / 100)
      )} jobs/s`,
      detail:
        workerEfficiency < 45
          ? 'Consumer threads stalled on poison-pill payloads'
          : prevState.workerScale === 3 && dbLoad > 75
          ? '3x workers causing downstream PostgreSQL write contention'
          : `Processing jobs at ${prevState.workerScale}x concurrency`
    }
  };

  // Track high stability streak for early Full Recovery confirmation
  const isHealthyForConfirmation =
    stability >= 84 &&
    errorRate < 5.0 &&
    Object.values(services).every((s) => s.status !== 'FAILED');

  const highStabilityStreak = isHealthyForConfirmation
    ? prevState.highStabilityStreak + 1
    : 0;

  const stabilizedAtTick =
    prevState.stabilizedAtTick === null && stability >= 80
      ? nextTick
      : prevState.stabilizedAtTick;

  let isFinished = false;
  let resultTier = prevState.resultTier;

  if (highStabilityStreak >= CONFIRMATION_TICKS_REQUIRED) {
    isFinished = true;
    resultTier = 'FULL_RECOVERY';
    pushLog(
      'RECOVERY',
      `SYSTEM STABILIZED: All services healthy for ${CONFIRMATION_TICKS_REQUIRED}s SLA confirmation window. Incident resolved!`
    );
  } else if (stability <= 0) {
    isFinished = true;
    resultTier = 'PRODUCTION_DOWN';
    pushLog(
      'CRITICAL',
      'PRODUCTION DOWN: Cascading failure exhausted system stability (0%). PagerDuty escalating to VP of Engineering.'
    );
  } else if (nextTimeRemaining <= 0) {
    isFinished = true;
  }

  const nextState: SimulationState = {
    ...prevState,
    tick: nextTick,
    timeRemaining: nextTimeRemaining,
    phase,
    stability,
    throughput,
    latency,
    errorRate,
    queueDepth,
    redisAvailability,
    dbLoad,
    workerEfficiency,
    retryAmplification,
    contextualFixProgress,
    cooldowns: nextCooldowns,
    highStabilityStreak,
    stabilitySum: prevState.stabilitySum + stability,
    throughputSum: prevState.throughputSum + throughput,
    throttledTicksCount:
      prevState.throttledTicksCount + (prevState.trafficThrottled ? 1 : 0),
    peakErrorRate: Math.max(prevState.peakErrorRate, errorRate),
    stabilizedAtTick,
    firedChatterIds,
    currentRiskText,
    services,
    logs: logs.slice(0, 45),
    history: {
      stability: [...prevState.history.stability.slice(-29), stability],
      throughput: [...prevState.history.throughput.slice(-29), throughput],
      latency: [...prevState.history.latency.slice(-29), latency],
      errorRate: [...prevState.history.errorRate.slice(-29), errorRate],
      queueDepth: [...prevState.history.queueDepth.slice(-29), queueDepth]
    },
    isFinished,
    resultTier
  };

  if (isFinished && !nextState.resultTier) {
    nextState.resultTier = evaluateFinalTier(nextState);
  }

  return nextState;
}

export function applyPlayerAction(
  state: SimulationState,
  actionId: ActionId
): SimulationState {
  if (state.isFinished || state.cooldowns[actionId] > 0) {
    return state;
  }

  // Check if this action is trying to activate a NEW mitigation slot when 2/2 slots are already full
  const isActivatingNewSlot =
    (actionId === 'THROTTLE_TRAFFIC' && !state.trafficThrottled) ||
    (actionId === 'CIRCUIT_BREAKER' && !state.circuitBreakerOpen) ||
    (actionId === 'SCALE_WORKERS' && state.workerScale === 1) ||
    (actionId === 'DISABLE_RETRIES' && !state.retriesDisabled);

  if (
    isActivatingNewSlot &&
    state.activeMitigationsCount >= state.maxMitigationSlots
  ) {
    const warningMsg = `CAPACITY LIMIT (${state.maxMitigationSlots}/${state.maxMitigationSlots} Active Mitigations): Turn off an active mitigation first so you don't over-clamp production.`;
    return {
      ...state,
      lastCapacityWarning: warningMsg,
      logs: [
        {
          id: `cap-${state.tick}-${state.logs.length}`,
          tick: state.tick,
          timeRemaining: state.timeRemaining,
          level: 'WARN',
          message: warningMsg
        },
        ...state.logs
      ].slice(0, 45)
    };
  }

  const nextState: SimulationState = {
    ...state,
    lastCapacityWarning: null,
    cooldowns: { ...state.cooldowns },
    logs: [...state.logs],
    decisions: [...state.decisions]
  };

  const recordAction = (params: {
    label: string;
    logMessage: string;
    outcomeSummary: string;
    immediateEffect: string;
    tradeoff: string;
    metricDelta: string;
    helpful: boolean;
    scoreDelta: number;
    reason: string;
    cooldownSecs: number;
  }) => {
    nextState.cooldowns[actionId] = params.cooldownSecs;
    if (params.helpful) {
      nextState.meaningfulActionsCount += 1;
    } else {
      nextState.harmfulActionsCount += 1;
    }
    nextState.logs.unshift({
      id: `act-${state.tick}-${nextState.logs.length}`,
      tick: state.tick,
      timeRemaining: state.timeRemaining,
      level: params.helpful ? 'ACTION' : 'WARN',
      message: `${params.logMessage} [${params.metricDelta}]`
    });
    nextState.decisions.push({
      tick: state.tick,
      timeRemaining: state.timeRemaining,
      actionId,
      label: params.label,
      outcomeSummary: params.outcomeSummary,
      immediateEffect: params.immediateEffect,
      tradeoff: params.tradeoff,
      metricDelta: params.metricDelta,
      helpful: params.helpful,
      scoreDelta: params.scoreDelta,
      reason: params.reason
    });
  };

  if (actionId === 'THROTTLE_TRAFFIC') {
    const enabling = !state.trafficThrottled;
    nextState.trafficThrottled = enabling;
    if (enabling) {
      const highPressure =
        state.dbLoad > 68 || state.queueDepth > 1300 || state.errorRate > 10;
      const nextDbLoad = Math.max(15, state.dbLoad - 9);
      const nextLatency = Math.max(80, state.latency - 65);
      const estThroughput = Math.round(state.throughput * 0.65);
      nextState.dbLoad = nextDbLoad;
      nextState.latency = nextLatency;

      recordAction({
        label: 'Enable Traffic Throttle (-35% Load)',
        logMessage: highPressure
          ? 'ACTION: Edge load-shedding enabled - dropping 35% of incoming requests to protect overloaded backends.'
          : 'WARN: Traffic Throttling enabled while backend load was already moderate - unnecessarily rejecting customer traffic.',
        outcomeSummary: highPressure
          ? 'Shed 35% edge traffic to buy recovery time for overloaded services.'
          : 'Throttled customer traffic when backends were not under severe load.',
        immediateEffect:
          'Turns away 35% of incoming requests at the API Gateway, immediately reducing downstream DB and Queue pressure.',
        tradeoff:
          'Uses 1 Mitigation Slot and caps max Stability at ~80% until you unthrottle traffic.',
        metricDelta: `DB Load: ${Math.round(state.dbLoad)}% -> ${Math.round(
          nextDbLoad
        )}% | P99 Latency: ${state.latency}ms -> ${nextLatency}ms | Throughput: ~${estThroughput} req/s`,
        helpful: highPressure,
        scoreDelta: highPressure ? 22 : -15,
        reason: highPressure
          ? 'Contained high backend pressure with timely load shedding (+22 pts)'
          : 'Throttled customer traffic unnecessarily when load was low (-15 pts)',
        cooldownSecs: 4
      });
    } else {
      const isSafeToUnthrottle =
        state.dbLoad < 68 &&
        (state.scenarioId !== 'QUEUE_MELTDOWN' || state.queueDepth < 900);
      recordAction({
        label: 'Unthrottle Edge Traffic (100% Load)',
        logMessage: isSafeToUnthrottle
          ? 'ACTION: Edge traffic throttling lifted - restoring 100% customer ingress and freeing 1 Mitigation Slot.'
          : 'WARN: Unthrottled traffic while backends were still overloaded!',
        outcomeSummary: isSafeToUnthrottle
          ? 'Restored 100% customer traffic once backends stabilized, unlocking Full Recovery SLA.'
          : 'Lifted traffic throttle too early while backends were still struggling.',
        immediateEffect:
          'Restores 100% customer request flow through the API Gateway and frees 1 Mitigation Slot.',
        tradeoff: isSafeToUnthrottle
          ? 'Removes the 80% stability cap so you can reach Full Recovery (>=84%).'
          : 'WARNING: Full customer load is slamming back into degraded services!',
        metricDelta: `Ingress Load: 65% -> 100% | DB Load: ${Math.round(
          state.dbLoad
        )}%`,
        helpful: isSafeToUnthrottle,
        scoreDelta: isSafeToUnthrottle ? 18 : -18,
        reason: isSafeToUnthrottle
          ? 'Restored 100% customer throughput after stabilizing backends (+18 pts)'
          : 'Unthrottled traffic prematurely while services were still overloaded (-18 pts)',
        cooldownSecs: 4
      });
    }
  } else if (actionId === 'CIRCUIT_BREAKER') {
    const enabling = !state.circuitBreakerOpen;
    nextState.circuitBreakerOpen = enabling;
    if (enabling) {
      const isCacheCollapseUseful =
        state.scenarioId === 'CACHE_COLLAPSE' && state.redisAvailability < 75;
      const isDbEmergencyUseful =
        state.scenarioId === 'DB_SATURATION' && state.dbLoad > 82;
      const isHelpful = isCacheCollapseUseful || isDbEmergencyUseful;

      if (isHelpful) {
        const nextDbLoad = Math.max(18, state.dbLoad - 12);
        const nextErrorRate = Math.max(
          2.0,
          Number((state.errorRate - 2.2).toFixed(1))
        );
        nextState.dbLoad = nextDbLoad;
        nextState.errorRate = nextErrorRate;
        recordAction({
          label: 'Open Circuit Breaker',
          logMessage:
            'ACTION: Circuit Breaker OPEN - stopping cascading calls to failing dependency.',
          outcomeSummary:
            'Isolated failing dependency calls so PostgreSQL could breathe.',
          immediateEffect:
            'Temporarily stops calls to the struggling service and serves fast fallback responses instead of hanging.',
          tradeoff:
            'Uses 1 Mitigation Slot and rejects ~3% of non-cached calls until closed.',
          metricDelta: `DB Load: ${Math.round(state.dbLoad)}% -> ${Math.round(
            nextDbLoad
          )}% | 5xx Error Rate: ${state.errorRate.toFixed(
            1
          )}% -> ${nextErrorRate.toFixed(1)}%`,
          helpful: true,
          scoreDelta: isCacheCollapseUseful ? 28 : 18,
          reason:
            'Isolated failing dependency with Circuit Breaker to stop a cascade (+25 pts)',
          cooldownSecs: 4
        });
      } else {
        const nextErrorRate = Math.min(
          65,
          Number((state.errorRate + 4.8).toFixed(1))
        );
        nextState.errorRate = nextErrorRate;
        recordAction({
          label: 'Open Circuit Breaker (Mismatched)',
          logMessage:
            'WARN: Circuit Breaker opened while Redis and PostgreSQL were healthy - fast-failing valid customer requests!',
          outcomeSummary:
            'Opened API Circuit Breaker when synchronous dependencies were not the bottleneck, spiking 5xx errors.',
          immediateEffect:
            'Fast-fails synchronous API calls even though the bottleneck is in the async worker queue.',
          tradeoff:
            'WARNING: Spikes 5xx Error Rate (+4.8%) and wastes 1 Mitigation Slot without helping Background Workers!',
          metricDelta: `5xx Error Rate: ${state.errorRate.toFixed(
            1
          )}% -> ${nextErrorRate.toFixed(1)}% (WORSE)`,
          helpful: false,
          scoreDelta: -22,
          reason:
            'Opened Circuit Breaker when synchronous dependencies were healthy, causing unnecessary errors (-22 pts)',
          cooldownSecs: 4
        });
      }
    } else {
      const isSafeToClose =
        state.scenarioId === 'QUEUE_MELTDOWN' ||
        (state.redisAvailability > 75 && state.dbLoad < 72);
      recordAction({
        label: 'Close Circuit Breaker',
        logMessage: isSafeToClose
          ? 'ACTION: Circuit Breaker CLOSED - resuming normal dependency calls and freeing 1 Mitigation Slot.'
          : 'WARN: Closed Circuit Breaker while dependency was still failing!',
        outcomeSummary: isSafeToClose
          ? 'Closed Circuit Breaker cleanly once backend health recovered.'
          : 'Closed Circuit Breaker prematurely while dependency was still struggling.',
        immediateEffect:
          'Resumes 100% normal traffic between Node.js API, Redis, and PostgreSQL and frees 1 Mitigation Slot.',
        tradeoff: isSafeToClose
          ? 'Eliminates fast-fail fallback errors so Stability can exceed 84%.'
          : 'WARNING: Re-exposes PostgreSQL to uncached read stampedes!',
        metricDelta: `Redis Hit Ratio: ${Math.round(
          state.redisAvailability
        )}% | DB Load: ${Math.round(state.dbLoad)}%`,
        helpful: isSafeToClose,
        scoreDelta: isSafeToClose ? 16 : -18,
        reason: isSafeToClose
          ? 'Closed Circuit Breaker once backend dependency recovered (+16 pts)'
          : 'Closed Circuit Breaker prematurely during active outage (-18 pts)',
        cooldownSecs: 4
      });
    }
  } else if (actionId === 'SCALE_WORKERS') {
    const nextScale: 1 | 2 | 3 =
      state.workerScale === 1 ? 2 : state.workerScale === 2 ? 3 : 1;
    nextState.workerScale = nextScale;

    if (state.scenarioId === 'DB_SATURATION' && nextScale > 1) {
      const nextDbLoad = Math.min(100, state.dbLoad + 11);
      nextState.dbLoad = nextDbLoad;
      recordAction({
        label: `Scale Workers to ${nextScale}x (Harmful in DB Lock)`,
        logMessage: `WARN: Scaling Background Workers to ${nextScale}x during DB Saturation increased PostgreSQL lock contention!`,
        outcomeSummary: `Scaled workers to ${nextScale}x during a DB lock incident, adding extra write contention.`,
        immediateEffect: `Increases worker pool to ${nextScale}x, which immediately adds write contention to an already locked PostgreSQL primary.`,
        tradeoff:
          'Counterproductive in DB Saturation: extra worker threads compete for scarce DB connections.',
        metricDelta: `Workers: ${state.workerScale}x -> ${nextScale}x | DB Load: ${Math.round(
          state.dbLoad
        )}% -> ${Math.round(nextDbLoad)}% (WORSE)`,
        helpful: false,
        scoreDelta: -25,
        reason:
          'Scaled up Background Workers during PostgreSQL lock contention (-25 pts)',
        cooldownSecs: 4
      });
    } else if (
      state.scenarioId === 'QUEUE_MELTDOWN' &&
      !state.contextualFixApplied &&
      nextScale > 1
    ) {
      const nextDbLoad = Math.min(100, state.dbLoad + 10);
      nextState.dbLoad = nextDbLoad;
      recordAction({
        label: `Scale Workers to ${nextScale}x (Before DLQ Purge)`,
        logMessage: `WARN: Scaled Workers to ${nextScale}x before purging poison jobs - new worker threads immediately stalled on poison payloads!`,
        outcomeSummary:
          'Scaled workers before isolating poison-pill messages into the DLQ.',
        immediateEffect:
          'Spins up extra worker threads, but they immediately block on the same malformed webhook messages.',
        tradeoff:
          'Wastes 1 Mitigation Slot and increases DB connection load (+10%) until you run [5] Purge Poison Jobs to DLQ.',
        metricDelta: `Worker Efficiency: ${Math.round(
          state.workerEfficiency
        )}% (STALLED) | DB Load: ${Math.round(state.dbLoad)}% -> ${Math.round(
          nextDbLoad
        )}%`,
        helpful: false,
        scoreDelta: -20,
        reason:
          'Scaled Workers before purging poison jobs to the Dead-Letter Queue (-20 pts)',
        cooldownSecs: 4
      });
    } else if (
      state.scenarioId === 'CACHE_COLLAPSE' &&
      nextScale > 1 &&
      state.dbLoad > 68
    ) {
      const nextDbLoad = Math.min(100, state.dbLoad + 9);
      nextState.dbLoad = nextDbLoad;
      recordAction({
        label: `Scale Workers to ${nextScale}x (DB Under Stress)`,
        logMessage: `WARN: Scaling Workers to ${nextScale}x while PostgreSQL is absorbing cache misses added extra DB load!`,
        outcomeSummary:
          'Scaled workers during a Redis cache stampede, increasing PostgreSQL load.',
        immediateEffect: `Increases background worker concurrency to ${nextScale}x while PostgreSQL is already struggling.`,
        tradeoff:
          'Adds +9% DB load and uses 1 Mitigation Slot when the queue was not the primary bottleneck.',
        metricDelta: `Workers: ${state.workerScale}x -> ${nextScale}x | DB Load: ${Math.round(
          state.dbLoad
        )}% -> ${Math.round(nextDbLoad)}% (WORSE)`,
        helpful: false,
        scoreDelta: -18,
        reason:
          'Scaled Workers while PostgreSQL was overloaded by cache misses (-18 pts)',
        cooldownSecs: 4
      });
    } else if (state.scenarioId === 'QUEUE_MELTDOWN' && nextScale === 2) {
      const nextQueue = Math.max(60, state.queueDepth - 240);
      nextState.queueDepth = nextQueue;
      recordAction({
        label: 'Scale Workers to 2x',
        logMessage:
          'ACTION: Background Workers scaled to 2x - doubling consumer drain rate within safe DB limits.',
        outcomeSummary:
          'Doubled worker throughput after DLQ isolation to drain the backlog safely.',
        immediateEffect:
          'Doubles async job drain rate and immediately clears 240 queued jobs.',
        tradeoff:
          'Uses 1 Mitigation Slot and adds moderate (+14%) write load to PostgreSQL.',
        metricDelta: `Workers: ${state.workerScale}x -> 2x | Queue Depth: ${state.queueDepth} -> ${nextQueue} jobs`,
        helpful: true,
        scoreDelta: 26,
        reason:
          'Scaled Workers to 2x after purging poison jobs to drain the queue safely (+26 pts)',
        cooldownSecs: 4
      });
    } else if (nextScale === 3 && state.dbLoad > 65 && !state.trafficThrottled) {
      const nextDbLoad = Math.min(100, state.dbLoad + 11);
      nextState.dbLoad = nextDbLoad;
      recordAction({
        label: 'Scale Workers to 3x (Unthrottled DB Spike)',
        logMessage:
          'WARN: Workers scaled to 3x without Traffic Throttling - high consumer concurrency is saturating PostgreSQL!',
        outcomeSummary:
          'Over-scaled workers to 3x without load shedding, spiking PostgreSQL connection load.',
        immediateEffect:
          'Maximizes queue drain capacity at 3x, but floods PostgreSQL with concurrent writes.',
        tradeoff:
          'WARNING: 3x worker concurrency spikes PostgreSQL load unless paired with Traffic Throttling!',
        metricDelta: `Workers: ${state.workerScale}x -> 3x | DB Load: ${Math.round(
          state.dbLoad
        )}% -> ${Math.round(nextDbLoad)}% (HIGH)`,
        helpful: false,
        scoreDelta: -18,
        reason:
          'Over-scaled Workers to 3x without throttling, spiking PostgreSQL load (-18 pts)',
        cooldownSecs: 4
      });
    } else {
      recordAction({
        label: `Scale Workers to ${nextScale}x`,
        logMessage: `ACTION: Background Worker pool adjusted to ${nextScale}x capacity.`,
        outcomeSummary: `Adjusted worker pool concurrency to ${nextScale}x.`,
        immediateEffect: `Sets background job consumer concurrency to ${nextScale}x.`,
        tradeoff:
          nextScale === 1
            ? 'Frees 1 Mitigation Slot and minimizes worker DB write load.'
            : 'Uses 1 Mitigation Slot and increases queue drain speed.',
        metricDelta: `Worker Pool: ${state.workerScale}x -> ${nextScale}x | Queue Depth: ${state.queueDepth} jobs`,
        helpful: true,
        scoreDelta: 12,
        reason: `Tuned Worker concurrency to ${nextScale}x (+12 pts)`,
        cooldownSecs: 4
      });
    }
  } else if (actionId === 'DISABLE_RETRIES') {
    const disabling = !state.retriesDisabled;
    nextState.retriesDisabled = disabling;
    if (disabling) {
      const isRetryStormActive =
        state.retryAmplification >= 1.75 ||
        state.scenarioId === 'DB_SATURATION' ||
        state.scenarioId === 'QUEUE_MELTDOWN';

      if (isRetryStormActive) {
        const nextAmp = Math.max(
          1.0,
          Number((state.retryAmplification - 0.85).toFixed(1))
        );
        const nextDbLoad = Math.max(16, state.dbLoad - 11);
        nextState.retryAmplification = nextAmp;
        nextState.dbLoad = nextDbLoad;
        recordAction({
          label: 'Disable Aggressive Retries',
          logMessage:
            'ACTION: Aggressive client retry loops disabled - halting retry storm amplification.',
          outcomeSummary:
            'Stopped retry storm amplification, immediately dropping duplicate load on backends.',
          immediateEffect:
            'Stops clients and workers from immediately re-sending failed requests, cutting duplicate traffic.',
          tradeoff:
            'Uses 1 Mitigation Slot; brief transient hiccups fail immediately instead of auto-retrying.',
          metricDelta: `Retry Amplification: ${state.retryAmplification.toFixed(
            1
          )}x -> ${nextAmp.toFixed(1)}x | DB Load: ${Math.round(
            state.dbLoad
          )}% -> ${Math.round(nextDbLoad)}%`,
          helpful: true,
          scoreDelta: 26,
          reason:
            'Halted active retry storm amplification with Disable Aggressive Retries (+26 pts)',
          cooldownSecs: 4
        });
      } else {
        const nextErrorRate = Math.min(
          65,
          Number((state.errorRate + 2.2).toFixed(1))
        );
        nextState.errorRate = nextErrorRate;
        recordAction({
          label: 'Disable Retries (No Retry Storm Active)',
          logMessage:
            'WARN: Disabled client retries when Retry Amplification was low (<1.7x) - transient glitches are now failing outright!',
          outcomeSummary:
            'Disabled retries during Cache Collapse when retry amplification was low, increasing visible client errors.',
          immediateEffect:
            'Turns off automatic client retries even though retry amplification was only ' +
            state.retryAmplification.toFixed(1) +
            'x.',
          tradeoff:
            'Uses 1 Mitigation Slot and increases 5xx Error Rate (+2.2%) from unretried transient misses.',
          metricDelta: `Retry Amplification: ${state.retryAmplification.toFixed(
            1
          )}x | 5xx Error Rate: ${state.errorRate.toFixed(
            1
          )}% -> ${nextErrorRate.toFixed(1)}%`,
          helpful: false,
          scoreDelta: -14,
          reason:
            'Disabled retries when no retry storm was active, increasing transient errors (-14 pts)',
          cooldownSecs: 4
        });
      }
    } else {
      const isSafe = state.stability >= 74 && state.dbLoad < 68;
      recordAction({
        label: 'Re-enable Auto Retries',
        logMessage: isSafe
          ? 'ACTION: Standard client retries re-enabled and 1 Mitigation Slot freed.'
          : 'WARN: Re-enabled retries while backends were still overloaded!',
        outcomeSummary: isSafe
          ? 'Re-enabled standard retries once error rates stabilized.'
          : 'Re-enabled aggressive retries while errors were still active.',
        immediateEffect:
          'Restores automatic client retries on transient errors and frees 1 Mitigation Slot.',
        tradeoff: isSafe
          ? 'Safe now that backend latency and errors are low.'
          : 'WARNING: Re-enabling retries while errors are high will reignite a retry storm!',
        metricDelta: `Auto Retries: ON | Current Error Rate: ${state.errorRate.toFixed(
          1
        )}%`,
        helpful: isSafe,
        scoreDelta: isSafe ? 12 : -18,
        reason: isSafe
          ? 'Restored standard client retries after stabilizing backends (+12 pts)'
          : 'Re-enabled retries prematurely during active errors (-18 pts)',
        cooldownSecs: 4
      });
    }
  } else if (actionId === 'CONTEXTUAL_FIX') {
    if (!state.contextualFixApplied) {
      const cfg = SCENARIOS[state.scenarioId];
      nextState.contextualFixApplied = true;
      nextState.contextualFixProgress = 25;

      let metricDelta = '';
      let immediateEffect = '';
      if (state.scenarioId === 'CACHE_COLLAPSE') {
        const nextRedis = Math.min(100, state.redisAvailability + 32);
        nextState.redisAvailability = nextRedis;
        immediateEffect =
          'Promotes warm Redis replica and starts repopulating hot cache keys over 4 seconds (does not use a Mitigation Slot).';
        metricDelta = `Redis Hit Ratio: ${Math.round(
          state.redisAvailability
        )}% -> ${Math.round(nextRedis)}% (Warming 25% -> 100%)`;
      } else if (state.scenarioId === 'DB_SATURATION') {
        const nextDbLoad = Math.max(20, state.dbLoad - 22);
        const nextLatency = Math.max(90, state.latency - 160);
        nextState.dbLoad = nextDbLoad;
        nextState.latency = nextLatency;
        immediateEffect =
          'Terminates stalled PostgreSQL lock holders and enforces statement_timeout across pools (does not use a Mitigation Slot).';
        metricDelta = `DB Load: ${Math.round(state.dbLoad)}% -> ${Math.round(
          nextDbLoad
        )}% | P99 Latency: ${state.latency}ms -> ${nextLatency}ms`;
      } else {
        const nextEff = Math.min(100, state.workerEfficiency + 45);
        const nextQueue = Math.max(80, state.queueDepth - 340);
        nextState.workerEfficiency = nextEff;
        nextState.queueDepth = nextQueue;
        immediateEffect =
          'Routes poison-pill payloads to the Dead-Letter Queue (DLQ) so stalled worker threads unblock (does not use a Mitigation Slot).';
        metricDelta = `Worker Efficiency: ${Math.round(
          state.workerEfficiency
        )}% -> ${Math.round(nextEff)}% | Queue Depth: ${
          state.queueDepth
        } -> ${nextQueue} jobs`;
      }

      recordAction({
        label: cfg.contextualActionLabel,
        logMessage: `RECOVERY INITIATED: ${cfg.contextualActionLabel} - ${cfg.contextualActionDescription}`,
        outcomeSummary: `Executed root-cause fix (${cfg.contextualActionLabel}), initiating primary recovery.`,
        immediateEffect,
        tradeoff:
          'Downstream pressure subsides progressively over 4 seconds - pair with 1-2 protective mitigations while services heal.',
        metricDelta,
        helpful: true,
        scoreDelta: 45,
        reason: `Executed root-cause remediation: ${cfg.contextualActionLabel} (+45 pts)`,
        cooldownSecs: 6
      });
    }
  }

  nextState.activeMitigationsCount = countActiveMitigations(nextState);
  return nextState;
}

