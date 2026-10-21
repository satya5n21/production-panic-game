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
    SCENARIOS,
    TOTAL_INCIDENT_SECONDS
} from './scenarios';
import { clamp, evaluateFinalTier } from './scoring';

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
            detail: 'Routing external traffic cleanly'
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
    let retryAmplification = 1.6;
    let currentRiskText = '';

    if (scenarioId === 'CACHE_COLLAPSE') {
        redisAvailability = 8;
        dbLoad = 78;
        latency = 420;
        errorRate = 11.4;
        stability = 66;
        retryAmplification = 1.75;
        currentRiskText =
            'Uncached API reads are flooding PostgreSQL - DB saturation imminent if Redis stays down.';

        baseServices.redis = {
            ...baseServices.redis,
            status: 'FAILED',
            health: 12,
            metricLabel: 'Hit Ratio',
            metricValue: '4.1% (MISS)',
            detail: 'Primary shard connection refused (ECONNREFUSED)'
        };
        baseServices.postgres = {
            ...baseServices.postgres,
            status: 'DEGRADED',
            health: 58,
            metricLabel: 'Pool Load',
            metricValue: '81% (SPIKE)',
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
        redisAvailability = 92;
        dbLoad = 91;
        latency = 680;
        errorRate = 14.2;
        stability = 64;
        retryAmplification = 2.6;
        queueDepth = 410;
        currentRiskText =
            'Aggressive API retries (2.6x) are hammering locked PostgreSQL tables and starving threads.';

        baseServices.postgres = {
            ...baseServices.postgres,
            status: 'FAILED',
            health: 24,
            metricLabel: 'Pool Load',
            metricValue: '96% (LOCKED)',
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
        redisAvailability = 95;
        dbLoad = 54;
        workerEfficiency = 18;
        queueDepth = 1840;
        latency = 360;
        errorRate = 9.2;
        stability = 67;
        retryAmplification = 2.1;
        currentRiskText =
            'Poison-pill jobs are stalling Workers - Queue backlog is growing at +260 jobs/sec.';

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
            metricValue: '360 ms',
            detail: 'Broker backpressure slowing async job publishing'
        };
    }

    return {
        scenarioId,
        scenarioTitle: config.title,
        scenarioSubtitle: config.subtitle,
        rootCauseText: config.rootCause,
        currentRiskText,
        hintText: config.initialHint,
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
        peakErrorRate: errorRate,
        stabilizedAtTick: null,
        meaningfulActionsCount: 0,
        harmfulActionsCount: 0,

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
                id: 'init-2',
                tick: 0,
                timeRemaining: TOTAL_INCIDENT_SECONDS,
                level: 'INFO',
                message: `ROOT CAUSE IDENTIFIED: ${config.rootCause}`
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

    const logs = [...prevState.logs];
    const pushLog = (
        level: 'INFO' | 'WARN' | 'CRITICAL' | 'ACTION' | 'RECOVERY',
        message: string
    ) => {
        logs.unshift({
            id: `tick-${nextTick}-${logs.length}`,
            tick: nextTick,
            timeRemaining: nextTimeRemaining,
            level,
            message
        });
    };

    // Gradual warm-up when contextual fix is applied (takes ~4 ticks for full effect)
    if (prevState.contextualFixApplied && contextualFixProgress < 100) {
        contextualFixProgress = Math.min(100, contextualFixProgress + 25);
        if (contextualFixProgress === 100) {
            const cfg = SCENARIOS[prevState.scenarioId];
            pushLog(
                'RECOVERY',
                `${cfg.contextualActionLabel} completed - primary bottleneck cleared.`
            );
        }
    }

    // Incoming traffic multiplier
    const trafficFactor = prevState.trafficThrottled ? 0.64 : 1.0;

    // Retry amplification dynamics
    if (prevState.retriesDisabled) {
        retryAmplification = Math.max(1.0, retryAmplification - 0.45);
    } else {
        const pressureTrigger = dbLoad > 75 || prevState.errorRate > 12;
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
        const workerDbPressure = (prevState.workerScale - 1) * 9;

        const targetDbLoad =
            28 +
            cacheMissRatio * 74 * trafficFactor * circuitShield * (retryAmplification * 0.65) +
            workerDbPressure;

        dbLoad = clamp(dbLoad + (targetDbLoad - dbLoad) * 0.34, 18, 100);

        const queueDelta =
            dbLoad > 82
                ? (dbLoad - 78) * 6 * trafficFactor - prevState.workerScale * 30
                : -45 * prevState.workerScale;
        queueDepth = Math.round(clamp(queueDepth + queueDelta, 60, 3200));

        if (redisAvailability < 40) {
            currentRiskText = prevState.circuitBreakerOpen
                ? 'Circuit Breaker is shielding PostgreSQL, but Redis is still offline - restore Redis Cluster!'
                : 'Redis cache misses are overwhelming PostgreSQL. Restore Redis and open Circuit Breaker.';
        } else if (dbLoad > 70) {
            currentRiskText =
                'Redis is warming up - keep Traffic Throttled or Circuit Breaker active until PostgreSQL load drops.';
        } else {
            currentRiskText =
                'Cache hit ratio restored and PostgreSQL load is stabilizing. Hold steady for SLA confirmation.';
        }
    } else if (prevState.scenarioId === 'DB_SATURATION') {
        const lockPenalty = prevState.contextualFixApplied
            ? Math.max(0, 38 - contextualFixProgress * 0.38)
            : 42;

        const workerContentionPenalty = (prevState.workerScale - 1) * 14;
        const circuitRelief = prevState.circuitBreakerOpen ? -14 : 0;

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
            currentRiskText = `Retry amplification (${retryAmplification.toFixed(1)}x) is pinning PostgreSQL! Disable Aggressive Retries immediately.`;
        } else if (!prevState.contextualFixApplied) {
            currentRiskText =
                'Stalled PostgreSQL locks are still blocking transactions - run Terminate Blocking DB Queries.';
        } else if (prevState.workerScale > 1 && dbLoad > 68) {
            currentRiskText =
                'Scaled Background Workers are adding write contention to PostgreSQL - scale workers back to 1x.';
        } else if (dbLoad > 65) {
            currentRiskText =
                'PostgreSQL connection pool is draining backlog - keep Traffic Throttled until latency normalizes.';
        } else {
            currentRiskText =
                'Database locks cleared and query latency nominal. Unthrottle traffic when ready for peak throughput.';
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
            workerEfficiency = clamp(workerEfficiency - 0.8, 10, 35);
        }

        const incomingJobsPerSec =
            290 *
            trafficFactor *
            (prevState.retriesDisabled ? 0.72 : retryAmplification * 0.68);
        const drainCapacityPerSec =
            prevState.workerScale * 215 * (workerEfficiency / 100);

        const netQueueDelta = incomingJobsPerSec - drainCapacityPerSec;
        queueDepth = Math.round(clamp(queueDepth + netQueueDelta, 40, 4800));

        const workerDbLoad =
            prevState.workerScale === 3 ? 36 : prevState.workerScale === 2 ? 14 : 4;
        const queuePressureOnDb = queueDepth > 2400 ? 18 : 6;
        const targetDbLoad =
            32 +
            workerDbLoad +
            queuePressureOnDb * trafficFactor -
            (prevState.circuitBreakerOpen ? 10 : 0);

        dbLoad = clamp(dbLoad + (targetDbLoad - dbLoad) * 0.35, 20, 98);

        if (!prevState.contextualFixApplied) {
            currentRiskText =
                'Poison-pill jobs are blocking Worker threads! Purge Poison Jobs to DLQ so workers can drain the queue.';
        } else if (queueDepth > 1200 && prevState.workerScale === 1) {
            currentRiskText =
                'DLQ routing active, but backlog is still high - Scale Background Workers to 2x and Disable Retries.';
        } else if (prevState.workerScale === 3 && dbLoad > 74) {
            currentRiskText =
                '3x Workers are overloading PostgreSQL connections! Step Workers down to 2x or Throttle Traffic.';
        } else if (queueDepth > 500) {
            currentRiskText = `Workers are draining the queue (${queueDepth.toLocaleString()} jobs left) - hold steady.`;
        } else {
            currentRiskText =
                'Queue backlog drained and worker pool healthy. System approaching Full Recovery.';
        }
    }

    // Coherent system-wide telemetry calculation
    const baseThroughput = prevState.trafficThrottled ? 860 : 1380;
    const circuitPenalty = prevState.circuitBreakerOpen ? 130 : 0;
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

    const rawErrorRate =
        (dbLoad > 72 ? (dbLoad - 72) * 0.72 : 0) +
        (100 - redisAvailability) *
        (prevState.circuitBreakerOpen ? 0.04 : 0.12) +
        (queueDepth > 1800 ? (queueDepth - 1800) * 0.008 : 0) +
        (prevState.circuitBreakerOpen ? 1.8 : 0) +
        (retryAmplification > 1.8 ? (retryAmplification - 1.8) * 4.5 : 0);

    const errorRate = Number(clamp(rawErrorRate, 0.2, 65).toFixed(1));

    const throughput = Math.round(
        clamp(
            baseThroughput - circuitPenalty - dbBottleneckPenalty - errorRate * 9,
            180,
            1450
        )
    );

    // Target overall system stability (0 - 100)
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
    const gatewayHealth = clamp(
        100 - errorRate * 1.6 - (prevState.trafficThrottled ? 6 : 0),
        15,
        100
    );

    const weightedHealth =
        apiHealth * 0.24 +
        dbHealth * 0.26 +
        redisHealth * 0.16 +
        queueHealth * 0.14 +
        workerHealth * 0.12 +
        gatewayHealth * 0.08;

    const maxStepDown = -3.8;
    const maxStepUp = 5.2;
    const stabilityDelta = clamp(
        (weightedHealth - prevState.stability) * 0.42,
        maxStepDown,
        maxStepUp
    );
    const stability = clamp(
        Number((prevState.stability + stabilityDelta).toFixed(1)),
        0,
        100
    );

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
            `Phase B Degradation: Primary bottleneck is spreading pressure across dependent services.`
        );
    } else if (phase === 'C' && prevState.phase !== 'C') {
        pushLog(
            'CRITICAL',
            `Phase C Cascading Failure: High latency (${latency}ms) and error rate (${errorRate}%) threatening SLA collapse!`
        );
    } else if (phase === 'D' && prevState.phase !== 'D') {
        pushLog(
            'RECOVERY',
            `Phase D Recovery Trajectory: Core dependencies stabilizing - maintain stability >= 84% for 5s to confirm Full Recovery.`
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
                ? 'Rate limiting active (-35% load shedding)'
                : errorRate > 12
                    ? `Returning ${errorRate}% HTTP 502/504 errors`
                    : 'Routing edge traffic normally'
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
                ? 'Circuit breaker open - fast-failing unhealthy calls'
                : retryAmplification > 1.8
                    ? `Retry amplification at ${retryAmplification.toFixed(1)}x`
                    : 'Handling application requests'
        },
        redis: {
            ...prevState.services.redis,
            health: Math.round(redisHealth),
            status: deriveServiceStatus(
                redisHealth,
                prevState.scenarioId === 'CACHE_COLLAPSE' && prevState.contextualFixApplied
            ),
            metricLabel: 'Hit Ratio',
            metricValue: `${Math.round(redisAvailability)}%`,
            detail:
                redisAvailability < 40
                    ? 'Connection pool offline - 90%+ cache misses'
                    : redisAvailability < 85
                        ? 'Replica promoted - repopulating hot cache keys'
                        : 'In-memory cache serving hits < 2ms'
        },
        postgres: {
            ...prevState.services.postgres,
            health: Math.round(dbHealth),
            status: deriveServiceStatus(
                dbHealth,
                prevState.scenarioId === 'DB_SATURATION' && prevState.contextualFixApplied
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
            status: deriveServiceStatus(queueHealth, queueDepth < prevState.queueDepth),
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
                prevState.scenarioId === 'QUEUE_MELTDOWN' && prevState.contextualFixApplied
            ),
            metricLabel: `Pool (${prevState.workerScale}x)`,
            metricValue: `${Math.round(
                prevState.workerScale * 215 * (workerEfficiency / 100)
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
            `SYSTEM STABILIZED: All services healthy for ${CONFIRMATION_TICKS_REQUIRED}s confirmation window. Incident resolved!`
        );
    } else if (stability <= 0) {
        isFinished = true;
        resultTier = 'PRODUCTION_DOWN';
        pushLog(
            'CRITICAL',
            `PRODUCTION DOWN: Cascading failure exhausted system stability (0%). PagerDuty escalating to VP of Engineering.`
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
        peakErrorRate: Math.max(prevState.peakErrorRate, errorRate),
        stabilizedAtTick,
        currentRiskText,
        services,
        logs: logs.slice(0, 40),
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

    const nextState: SimulationState = {
        ...state,
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
            helpful: params.helpful
        });
    };

    if (actionId === 'THROTTLE_TRAFFIC') {
        const enabling = !state.trafficThrottled;
        nextState.trafficThrottled = enabling;
        if (enabling) {
            const nextDbLoad = Math.max(15, state.dbLoad - 9);
            const nextLatency = Math.max(80, state.latency - 65);
            const estThroughput = Math.round(state.throughput * 0.68);
            nextState.dbLoad = nextDbLoad;
            nextState.latency = nextLatency;
            recordAction({
                label: 'Enable Traffic Throttle (-35% Load)',
                logMessage:
                    'ACTION: Edge rate-limiting enabled - shedding 35% non-essential traffic to relieve downstream pressure.',
                outcomeSummary:
                    'Reduced incoming request pressure across API, PostgreSQL, and Queue.',
                immediateEffect:
                    'Cuts incoming request load by 35%, easing PostgreSQL pool load and P99 latency.',
                tradeoff:
                    'Customer throughput drops by ~35% until you unthrottle edge traffic.',
                metricDelta: `DB Load: ${Math.round(state.dbLoad)}% -> ${Math.round(nextDbLoad)}% | P99 Latency: ${state.latency}ms -> ${nextLatency}ms | Est. Throughput: ~${estThroughput} req/s`,
                helpful: true,
                cooldownSecs: 4
            });
        } else {
            const isSafe = state.stability >= 65;
            recordAction({
                label: 'Disable Traffic Throttle (100% Load)',
                logMessage:
                    'ACTION: Edge traffic throttling lifted - restoring 100% ingress throughput.',
                outcomeSummary: isSafe
                    ? 'Restored full customer throughput after stabilizing core services.'
                    : 'Unthrottled traffic while services were still degraded, increasing load.',
                immediateEffect:
                    'Restores 100% customer request ingress through the API Gateway.',
                tradeoff: isSafe
                    ? 'Slightly increases backend load as full traffic resumes.'
                    : 'WARNING: Full traffic is hitting dependencies that are still degraded!',
                metricDelta: `Ingress Load: 65% -> 100% | Current Stability: ${Math.round(state.stability)}%`,
                helpful: isSafe,
                cooldownSecs: 4
            });
        }
    } else if (actionId === 'CIRCUIT_BREAKER') {
        const enabling = !state.circuitBreakerOpen;
        nextState.circuitBreakerOpen = enabling;
        if (enabling) {
            const nextDbLoad = Math.max(18, state.dbLoad - 11);
            const nextErrorRate = Math.max(1.5, Number((state.errorRate - 2.4).toFixed(1)));
            nextState.dbLoad = nextDbLoad;
            nextState.errorRate = nextErrorRate;
            recordAction({
                label: 'Open Circuit Breaker',
                logMessage:
                    'ACTION: Circuit Breaker OPEN - isolating failing dependency calls and preventing cascading timeouts.',
                outcomeSummary:
                    'Contained cascading latency between Node.js API and struggling backends.',
                immediateEffect:
                    'Halts cascading timeouts by fast-failing unhealthy upstream calls and shielding PostgreSQL.',
                tradeoff:
                    'Rejects ~1.8% of non-critical calls with fast fallback responses while open.',
                metricDelta: `DB Load: ${Math.round(state.dbLoad)}% -> ${Math.round(nextDbLoad)}% | 5xx Error Rate: ${state.errorRate.toFixed(1)}% -> ${nextErrorRate.toFixed(1)}%`,
                helpful: true,
                cooldownSecs: 4
            });
        } else {
            const isSafe = state.redisAvailability > 65 && state.dbLoad < 78;
            recordAction({
                label: 'Close Circuit Breaker',
                logMessage:
                    'ACTION: Circuit Breaker CLOSED - resuming normal dependency traffic.',
                outcomeSummary: isSafe
                    ? 'Closed circuit breaker safely once backend health recovered.'
                    : 'Closed circuit breaker prematurely while backend dependency was still struggling.',
                immediateEffect:
                    'Routes 100% of API dependency calls back to Redis and PostgreSQL.',
                tradeoff: isSafe
                    ? 'Normal call routing restored with minimal risk.'
                    : 'WARNING: Closing the breaker while Redis/DB are degraded re-exposes the API to cascading timeouts!',
                metricDelta: `Redis Hit Ratio: ${Math.round(state.redisAvailability)}% | DB Load: ${Math.round(state.dbLoad)}%`,
                helpful: isSafe,
                cooldownSecs: 4
            });
        }
    } else if (actionId === 'SCALE_WORKERS') {
        const nextScale: 1 | 2 | 3 =
            state.workerScale === 1 ? 2 : state.workerScale === 2 ? 3 : 1;
        nextState.workerScale = nextScale;

        if (state.scenarioId === 'DB_SATURATION' && nextScale > 1) {
            const nextDbLoad = Math.min(100, state.dbLoad + 10);
            nextState.dbLoad = nextDbLoad;
            recordAction({
                label: `Scale Workers to ${nextScale}x`,
                logMessage: `WARN: Scaling Background Workers to ${nextScale}x during DB Saturation increased PostgreSQL lock contention!`,
                outcomeSummary: `Scaled workers to ${nextScale}x during a DB lock incident, adding extra write load.`,
                immediateEffect: `Increases worker pool to ${nextScale}x, which immediately adds write contention to an already locked PostgreSQL primary.`,
                tradeoff:
                    'Counterproductive in DB Saturation: extra worker threads compete for scarce DB connections.',
                metricDelta: `Workers: ${state.workerScale}x -> ${nextScale}x | DB Load: ${Math.round(state.dbLoad)}% -> ${Math.round(nextDbLoad)}% (WORSE)`,
                helpful: false,
                cooldownSecs: 4
            });
        } else if (state.scenarioId === 'QUEUE_MELTDOWN' && nextScale === 2) {
            const nextQueue = Math.max(60, state.queueDepth - 220);
            nextState.queueDepth = nextQueue;
            recordAction({
                label: 'Scale Workers to 2x',
                logMessage:
                    'ACTION: Background Workers scaled to 2x - doubling consumer drain rate within safe DB limits.',
                outcomeSummary:
                    'Doubled worker throughput to drain the message queue backlog safely.',
                immediateEffect:
                    'Doubles async job drain rate and immediately clears 220 queued jobs.',
                tradeoff:
                    'Adds moderate (+14%) write load to PostgreSQL, which stays within safe limits at 2x.',
                metricDelta: `Workers: ${state.workerScale}x -> 2x | Queue Depth: ${state.queueDepth} -> ${nextQueue} jobs`,
                helpful: true,
                cooldownSecs: 4
            });
        } else if (nextScale === 3 && state.dbLoad > 68) {
            const nextDbLoad = Math.min(100, state.dbLoad + 9);
            nextState.dbLoad = nextDbLoad;
            recordAction({
                label: 'Scale Workers to 3x (Over-scaled)',
                logMessage:
                    'WARN: Workers scaled to 3x - high consumer concurrency is spiking PostgreSQL connection pool load!',
                outcomeSummary:
                    'Over-scaled workers to 3x, causing downstream PostgreSQL connection pressure.',
                immediateEffect:
                    'Maximizes queue drain capacity at 3x, but floods PostgreSQL with concurrent writes.',
                tradeoff:
                    'WARNING: 3x worker concurrency spikes PostgreSQL load and risks a secondary DB outage!',
                metricDelta: `Workers: ${state.workerScale}x -> 3x | DB Load: ${Math.round(state.dbLoad)}% -> ${Math.round(nextDbLoad)}% (HIGH)`,
                helpful: false,
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
                        ? 'Minimizes worker database write pressure, but drains queues at base 1x speed.'
                        : 'Increases queue drain speed while adding proportional DB write load.',
                metricDelta: `Worker Pool: ${state.workerScale}x -> ${nextScale}x | Queue Depth: ${state.queueDepth} jobs`,
                helpful: true,
                cooldownSecs: 4
            });
        }
    } else if (actionId === 'DISABLE_RETRIES') {
        const disabling = !state.retriesDisabled;
        nextState.retriesDisabled = disabling;
        if (disabling) {
            const nextAmp = Math.max(1.0, Number((state.retryAmplification - 0.8).toFixed(1)));
            const nextDbLoad = Math.max(16, state.dbLoad - 10);
            nextState.retryAmplification = nextAmp;
            nextState.dbLoad = nextDbLoad;
            recordAction({
                label: 'Disable Aggressive Retries',
                logMessage:
                    'ACTION: Aggressive client retry loops disabled - halting retry amplification storm.',
                outcomeSummary:
                    'Stopped retry storm amplification, immediately dropping duplicate load on backends.',
                immediateEffect:
                    'Stops client retry storms from multiplying failed requests across the API and database.',
                tradeoff:
                    'Transient failed requests fail immediately instead of being automatically retried.',
                metricDelta: `Retry Amplification: ${state.retryAmplification.toFixed(1)}x -> ${nextAmp.toFixed(1)}x | DB Load: ${Math.round(state.dbLoad)}% -> ${Math.round(nextDbLoad)}%`,
                helpful: true,
                cooldownSecs: 4
            });
        } else {
            const isSafe = state.stability >= 75;
            recordAction({
                label: 'Re-enable Auto Retries',
                logMessage: 'ACTION: Automatic client retries re-enabled.',
                outcomeSummary: isSafe
                    ? 'Re-enabled standard retries after system stabilized.'
                    : 'Re-enabled aggressive retries while errors were still active.',
                immediateEffect: 'Restores automatic client retries on failed API calls.',
                tradeoff: isSafe
                    ? 'Safe now that error rates are low.'
                    : 'WARNING: Re-enabling retries while error rates are elevated will reignite a retry storm!',
                metricDelta: `Auto Retries: ON | Current Error Rate: ${state.errorRate.toFixed(1)}%`,
                helpful: isSafe,
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
                    'Promotes warm Redis replica and starts repopulating hot cache keys over 4 seconds.';
                metricDelta = `Redis Hit Ratio: ${Math.round(state.redisAvailability)}% -> ${Math.round(nextRedis)}% (Warming 25% -> 100%)`;
            } else if (state.scenarioId === 'DB_SATURATION') {
                const nextDbLoad = Math.max(20, state.dbLoad - 22);
                const nextLatency = Math.max(90, state.latency - 160);
                nextState.dbLoad = nextDbLoad;
                nextState.latency = nextLatency;
                immediateEffect =
                    'Terminates stalled PostgreSQL lock holders and enforces statement_timeout across pools.';
                metricDelta = `DB Load: ${Math.round(state.dbLoad)}% -> ${Math.round(nextDbLoad)}% | P99 Latency: ${state.latency}ms -> ${nextLatency}ms`;
            } else {
                const nextEff = Math.min(100, state.workerEfficiency + 45);
                const nextQueue = Math.max(80, state.queueDepth - 340);
                nextState.workerEfficiency = nextEff;
                nextState.queueDepth = nextQueue;
                immediateEffect =
                    'Routes poison-pill payloads to the Dead-Letter Queue (DLQ) so stalled worker threads unblock.';
                metricDelta = `Worker Efficiency: ${Math.round(state.workerEfficiency)}% -> ${Math.round(nextEff)}% | Queue Depth: ${state.queueDepth} -> ${nextQueue} jobs`;
            }

            recordAction({
                label: cfg.contextualActionLabel,
                logMessage: `RECOVERY INITIATED: ${cfg.contextualActionLabel} - ${cfg.contextualActionDescription}`,
                outcomeSummary: `Executed root-cause fix (${cfg.contextualActionLabel}), initiating primary recovery.`,
                immediateEffect,
                tradeoff:
                    'Downstream pressure subsides progressively over 4 seconds - keep protective mitigations active while services stabilize.',
                metricDelta,
                helpful: true,
                cooldownSecs: 6
            });
        }
    }

    return nextState;
}