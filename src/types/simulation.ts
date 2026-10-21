export type ScenarioId = 'CACHE_COLLAPSE' | 'DB_SATURATION' | 'QUEUE_MELTDOWN';

export type ServiceId = 'gateway' | 'api' | 'redis' | 'postgres' | 'queue' | 'workers';

export type ServiceStatus = 'HEALTHY' | 'DEGRADED' | 'FAILED' | 'RECOVERING';

export type EscalationPhase = 'A' | 'B' | 'C' | 'D';

export type ActionId =
    | 'THROTTLE_TRAFFIC'
    | 'CIRCUIT_BREAKER'
    | 'SCALE_WORKERS'
    | 'DISABLE_RETRIES'
    | 'CONTEXTUAL_FIX';

export type ResultTier =
    | 'FULL_RECOVERY'
    | 'INCIDENT_CONTAINED'
    | 'DEGRADED_SURVIVED'
    | 'PRODUCTION_DOWN';

export interface ServiceState {
    id: ServiceId;
    name: string;
    shortName: string;
    role: string;
    status: ServiceStatus;
    health: number; // 0 - 100
    metricLabel: string;
    metricValue: string;
    detail: string;
}

export interface LogEntry {
    id: string;
    tick: number;
    timeRemaining: number;
    level: 'INFO' | 'WARN' | 'CRITICAL' | 'ACTION' | 'RECOVERY';
    message: string;
}

export interface DecisionRecord {
    tick: number;
    timeRemaining: number;
    actionId: ActionId;
    label: string;
    outcomeSummary: string;
    immediateEffect: string;
    tradeoff: string;
    metricDelta: string;
    helpful: boolean;
}

export interface MetricsHistory {
    stability: number[];
    throughput: number[];
    latency: number[];
    errorRate: number[];
    queueDepth: number[];
}

export interface SimulationState {
    scenarioId: ScenarioId;
    scenarioTitle: string;
    scenarioSubtitle: string;
    rootCauseText: string;
    currentRiskText: string;
    hintText: string;
    tick: number;
    timeRemaining: number;
    phase: EscalationPhase;

    // Core metrics
    stability: number; // 0 - 100
    throughput: number; // req/s
    latency: number; // ms (P99)
    errorRate: number; // % (0 - 100)
    queueDepth: number; // active jobs

    // Internal underlying pressure variables (0 - 100)
    redisAvailability: number;
    dbLoad: number;
    workerEfficiency: number;
    retryAmplification: number; // 1.0x to 3.5x

    // Active player mitigations
    trafficThrottled: boolean;
    circuitBreakerOpen: boolean;
    workerScale: 1 | 2 | 3;
    retriesDisabled: boolean;
    contextualFixApplied: boolean;
    contextualFixProgress: number; // 0 to 100%

    // Cooldowns in seconds remaining
    cooldowns: Record<ActionId, number>;

    // Confirmation & scoring trackers
    highStabilityStreak: number; // Needs 5 consecutive ticks >= 84 for early Full Recovery
    stabilitySum: number;
    peakErrorRate: number;
    stabilizedAtTick: number | null;
    meaningfulActionsCount: number;
    harmfulActionsCount: number;

    services: Record<ServiceId, ServiceState>;
    logs: LogEntry[];
    decisions: DecisionRecord[];
    history: MetricsHistory;

    isFinished: boolean;
    resultTier: ResultTier | null;
}

export interface ScenarioConfig {
    id: ScenarioId;
    code: string;
    title: string;
    subtitle: string;
    alertHeadline: string;
    rootCause: string;
    initialHint: string;
    contextualActionLabel: string;
    contextualActionActiveLabel: string;
    contextualActionDescription: string;
    contextualTargetService: ServiceId;
    postmortemSummary: string;
    preventionTip: string;
}

export interface ScoreBreakdown {
    total: number;
    stabilityScore: number;
    availabilityScore: number;
    speedBonus: number;
    decisionScore: number;
}

export interface ReplayGuidance {
    scoreContributors: string[];
    nextRunSuggestion: string;
}