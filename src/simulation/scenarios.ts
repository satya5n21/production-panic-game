import { ScenarioConfig, ScenarioId } from '../types/simulation';

export const SCENARIOS: Record<ScenarioId, ScenarioConfig> = {
    CACHE_COLLAPSE: {
        id: 'CACHE_COLLAPSE',
        code: 'INC-401',
        title: 'Cache Collapse',
        subtitle: 'Redis Cluster Eviction & Connection Pool Exhaustion',
        alertHeadline: 'CRITICAL: Redis Cache cluster unreachable - 96% cache misses hitting PostgreSQL',
        rootCause:
            'A misconfigured TTL eviction storm crashed the primary Redis node, forcing all read queries directly onto PostgreSQL.',
        initialHint:
            'Redis is down and uncached reads are overwhelming PostgreSQL. Restore the Redis node, and use Circuit Breaker or Traffic Throttle to shield PostgreSQL while the cache warms up.',
        contextualActionLabel: 'Restore & Warm Redis Cluster',
        contextualActionActiveLabel: 'Redis Cluster Warming / Active',
        contextualActionDescription:
            'Failover to warm standby replica and progressively repopulate hot keys over 4 seconds.',
        contextualTargetService: 'redis',
        postmortemSummary:
            'When Redis dropped offline, the Node.js API fell back to direct PostgreSQL queries for every session lookup. Without a circuit breaker or cache warm-up, connection pools saturated within seconds.',
        preventionTip:
            'Implement request coalescing (singleflight) on cache misses and configure a local in-memory L1 fallback cache with stale-while-revalidate.'
    },
    DB_SATURATION: {
        id: 'DB_SATURATION',
        code: 'INC-509',
        title: 'Database Saturation',
        subtitle: 'PostgreSQL Lock Contention & Retry Amplification Storm',
        alertHeadline: 'CRITICAL: PostgreSQL P99 query latency > 950ms - API retry storm detected',
        rootCause:
            'Unindexed batch writes locked core transactional tables while aggressive API client retries multiplied incoming database load by 3.2x.',
        initialHint:
            'Aggressive retries are multiplying load on a saturated PostgreSQL primary. Disable Aggressive Retries, Throttle Incoming Traffic, and Terminate Blocking Queries. Avoid scaling workers up!',
        contextualActionLabel: 'Terminate Blocking DB Queries',
        contextualActionActiveLabel: 'DB Locks Cleared & Pool Tuned',
        contextualActionDescription:
            'Run pg_terminate_backend() on stalled lock holders and enforce strict statement_timeout.',
        contextualTargetService: 'postgres',
        postmortemSummary:
            'A lock contention spike slowed PostgreSQL responses above the API timeout threshold, triggering immediate client retries that tripled active query concurrency.',
        preventionTip:
            'Replace fixed-interval retries with jittered exponential backoff + retry budgets, and enforce strict statement_timeout rules on transactional pools.'
    },
    QUEUE_MELTDOWN: {
        id: 'QUEUE_MELTDOWN',
        code: 'INC-712',
        title: 'Queue Meltdown',
        subtitle: 'Background Worker Stall & Poison-Pill Backlog Surge',
        alertHeadline: 'CRITICAL: Message Queue depth > 1,800 jobs - Worker consumer pool stalled',
        rootCause:
            'Malformed webhook payloads triggered infinite retry loops inside Background Workers, blocking consumer threads and flooding the message queue.',
        initialHint:
            'Workers are stuck retrying poison messages and the queue is exploding. Purge Poison Jobs to DLQ, Disable Aggressive Retries, and Scale Background Workers to 2x (watch DB load at 3x!).',
        contextualActionLabel: 'Purge Poison Jobs to DLQ',
        contextualActionActiveLabel: 'DLQ Routing Active',
        contextualActionDescription:
            'Isolate unprocessable payloads into the Dead-Letter Queue so worker threads unblock.',
        contextualTargetService: 'workers',
        postmortemSummary:
            'Workers lacked a Dead-Letter Queue (DLQ) policy for malformed events, causing consumer threads to block indefinitely while new async jobs accumulated at 400 msgs/sec.',
        preventionTip:
            'Enforce schema validation at the API Gateway boundary and configure maxReceiveCount = 3 with automatic Dead-Letter Queue isolation.'
    }
};

export const SCENARIO_ORDER: ScenarioId[] = [
    'CACHE_COLLAPSE',
    'DB_SATURATION',
    'QUEUE_MELTDOWN'
];

export const TOTAL_INCIDENT_SECONDS = 60;
export const CONFIRMATION_TICKS_REQUIRED = 5;