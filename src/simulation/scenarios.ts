import {
  ScenarioConfig,
  ScenarioId,
  SreConceptDefinition,
  SreConceptId
} from '../types/simulation';

export const SRE_CONCEPTS: Record<SreConceptId, SreConceptDefinition> = {
  P99_LATENCY: {
    id: 'P99_LATENCY',
    term: 'P99 Latency',
    shortPlainLanguage:
      'The response time experienced by the slowest 1% of requests. When P99 spikes above 500ms, customers see frozen spinners and timeouts.',
    whenToUse:
      'Watch P99 Latency to see if slow database queries or cache misses are blocking the Node.js API.'
  },
  CIRCUIT_BREAKER: {
    id: 'CIRCUIT_BREAKER',
    term: 'Circuit Breaker',
    shortPlainLanguage:
      'Temporarily stops calls to a struggling dependency so the rest of the system can keep working instead of hanging on timeouts.',
    whenToUse:
      'Use when a downstream service (like Redis) is offline and fallback calls are overwhelming PostgreSQL. Close it once the service recovers.'
  },
  RETRY_STORM: {
    id: 'RETRY_STORM',
    term: 'Retry Storm',
    shortPlainLanguage:
      'When requests fail or time out, clients automatically re-send them, multiplying load by 2x-3x on an already overloaded server.',
    whenToUse:
      'Disable Aggressive Retries when Retry Amplification climbs above 1.8x during database or queue slowdowns.'
  },
  CACHE_STAMPEDE: {
    id: 'CACHE_STAMPEDE',
    term: 'Cache Miss Stampede',
    shortPlainLanguage:
      'When Redis cache goes down, every read request misses the cache and hits PostgreSQL directly all at once.',
    whenToUse:
      'Shield PostgreSQL with a Circuit Breaker or Traffic Throttle while restoring and warming the Redis cache.'
  },
  DLQ: {
    id: 'DLQ',
    term: 'Dead-Letter Queue (DLQ)',
    shortPlainLanguage:
      'A holding pen for broken ("poison-pill") background jobs so workers stop choking on the same bad message forever.',
    whenToUse:
      'Purge poison jobs to the DLQ before scaling up workers, otherwise new workers will also get stuck.'
  },
  LOAD_SHEDDING: {
    id: 'LOAD_SHEDDING',
    term: 'Traffic Throttling (Load Shedding)',
    shortPlainLanguage:
      'Temporarily turns away 35% of incoming requests at the front door so core servers have breathing room to recover.',
    whenToUse:
      'Use to stop an immediate collapse, then unthrottle once backends heal so 100% of customers can get through.'
  }
};

export const SCENARIOS: Record<ScenarioId, ScenarioConfig> = {
  CACHE_COLLAPSE: {
    id: 'CACHE_COLLAPSE',
    code: 'INC-401',
    title: 'Cache Collapse',
    subtitle: 'Redis Eviction Storm & Database Read Stampede',
    alertHeadline:
      'P0 ALERT: Redis Cache cluster unreachable - 92%+ cache misses hitting PostgreSQL',
    symptomSummary:
      'Redis Hit Ratio plunged to 8%. Node.js API latency is climbing (420ms+) because every user session lookup is falling back to PostgreSQL.',
    likelyCauseChain:
      'Redis Cache [FAIL] -> Uncached reads flood PostgreSQL [81% Load] -> Node.js API P99 Latency spikes',
    rootCause:
      'A misconfigured TTL eviction storm crashed the primary Redis node, forcing all read queries directly onto PostgreSQL.',
    optionalHint:
      'Strategy: Trigger [5] Restore & Warm Redis Cluster right away. Use 1 or 2 mitigation slots ([2] Circuit Breaker or [1] Throttle Traffic) to shield PostgreSQL during the 4-second cache warm-up, then close/unthrottle once Redis Hit Ratio passes 80%.',
    relevantConcepts: ['CACHE_STAMPEDE', 'CIRCUIT_BREAKER', 'LOAD_SHEDDING'],
    contextualActionLabel: 'Restore & Warm Redis Cluster',
    contextualActionActiveLabel: 'Redis Cluster Warming / Active',
    contextualActionDescription:
      'Failover to warm standby replica and progressively repopulate hot cache keys over 4 seconds.',
    contextualTargetService: 'redis',
    postmortemSummary:
      'When Redis dropped offline, the Node.js API fell back to direct PostgreSQL queries for every session lookup. Without temporary isolation, connection pools saturated within seconds.',
    preventionTip:
      'Implement request coalescing (singleflight) on cache misses and configure a local in-memory L1 fallback cache with stale-while-revalidate.',
    viableStrategies: [
      'Circuit Shield Path: Open [2] Circuit Breaker + run [5] Restore Redis, then close the breaker once Redis Hit Ratio > 80% for full SLA recovery.',
      'Edge Load-Shed Path: Enable [1] Traffic Throttle + run [5] Restore Redis to protect PostgreSQL, then unthrottle once DB load drops below 50%.'
    ]
  },
  DB_SATURATION: {
    id: 'DB_SATURATION',
    code: 'INC-509',
    title: 'Database Saturation',
    subtitle: 'PostgreSQL Lock Contention & Client Retry Storm',
    alertHeadline:
      'P0 ALERT: PostgreSQL P99 query latency > 680ms - 2.6x API retry storm detected',
    symptomSummary:
      'PostgreSQL pool load is pinned at 91%+ with row-level locks. Timed-out API requests are automatically retrying and multiplying database traffic by 2.6x.',
    likelyCauseChain:
      'Locked DB Tables [FAIL] -> Slow API Responses -> Client Retries (2.6x) -> Total DB Pool Exhaustion',
    rootCause:
      'Unindexed batch writes locked core transactional tables while aggressive API client retries multiplied incoming database load by 2.6x-3.2x.',
    optionalHint:
      'Strategy: Stop the retry multiplier with [4] Disable Aggressive Retries, clear the stuck queries with [5] Terminate Blocking DB Queries, and optionally use [1] Throttle Traffic until DB load drops below 55%. Never scale workers up while DB locks are active!',
    relevantConcepts: ['RETRY_STORM', 'P99_LATENCY', 'LOAD_SHEDDING'],
    contextualActionLabel: 'Terminate Blocking DB Queries',
    contextualActionActiveLabel: 'DB Locks Cleared & Pool Tuned',
    contextualActionDescription:
      'Run pg_terminate_backend() on stalled lock holders and enforce strict statement_timeout.',
    contextualTargetService: 'postgres',
    postmortemSummary:
      'A lock contention spike slowed PostgreSQL responses above the API timeout threshold, triggering immediate client retries that nearly tripled active query concurrency.',
    preventionTip:
      'Replace fixed-interval retries with jittered exponential backoff + retry budgets, and enforce strict statement_timeout rules on transactional pools.',
    viableStrategies: [
      'Surgical Retry Cutoff: Enable [4] Disable Aggressive Retries + [5] Terminate Blocking DB Queries to drop load without throttling customer ingress.',
      'Full Load-Shed Cushion: Combine [4] Disable Retries + [1] Throttle Traffic with [5] Terminate Queries, then unthrottle once DB load < 55%.'
    ]
  },
  QUEUE_MELTDOWN: {
    id: 'QUEUE_MELTDOWN',
    code: 'INC-712',
    title: 'Queue Meltdown',
    subtitle: 'Poison-Pill Worker Stall & Async Backlog Surge',
    alertHeadline:
      'P0 ALERT: Message Queue depth > 1,800 jobs - Background Workers stuck in retry loop',
    symptomSummary:
      'Queue backlog is surging (+260 jobs/sec) while Worker drain rate collapsed to 35 jobs/sec. Redis and PostgreSQL are currently healthy.',
    likelyCauseChain:
      'Poison Webhook Payloads -> Workers Stuck Retrying [FAIL] -> Queue Backlog Floods Broker -> API Backpressure',
    rootCause:
      'Malformed webhook payloads triggered infinite retry loops inside Background Workers, blocking consumer threads and flooding the message queue.',
    optionalHint:
      'Strategy: First unblock threads with [5] Purge Poison Jobs to DLQ. Then use your 2 mitigation slots on [3] Scale Workers (2x) and [4] Disable Aggressive Retries to drain the 1,800-job backlog. Avoid opening the Circuit Breaker (Redis/DB are fine) or scaling Workers before purging!',
    relevantConcepts: ['DLQ', 'RETRY_STORM', 'LOAD_SHEDDING'],
    contextualActionLabel: 'Purge Poison Jobs to DLQ',
    contextualActionActiveLabel: 'DLQ Routing Active',
    contextualActionDescription:
      'Isolate unprocessable poison payloads into the Dead-Letter Queue so worker threads unblock.',
    contextualTargetService: 'workers',
    postmortemSummary:
      'Workers lacked a Dead-Letter Queue (DLQ) policy for malformed events, causing consumer threads to block indefinitely while new async jobs accumulated.',
    preventionTip:
      'Enforce schema validation at the API Gateway boundary and configure maxReceiveCount = 3 with automatic Dead-Letter Queue isolation.',
    viableStrategies: [
      'Balanced 2x Drain: Run [5] Purge Poison Jobs to DLQ first, then engage [3] Scale Workers to 2x + [4] Disable Retries for a clean drain.',
      'Throttled Surge Drain: Run [5] Purge Poison Jobs to DLQ, then combine [1] Throttle Traffic + [3] Scale Workers to 2x and unthrottle once Queue < 450.'
    ]
  }
};

export const SCENARIO_ORDER: ScenarioId[] = [
  'CACHE_COLLAPSE',
  'DB_SATURATION',
  'QUEUE_MELTDOWN'
];

export const TOTAL_INCIDENT_SECONDS = 60;
export const CONFIRMATION_TICKS_REQUIRED = 5;
export const MAX_ACTIVE_MITIGATION_SLOTS = 2;

