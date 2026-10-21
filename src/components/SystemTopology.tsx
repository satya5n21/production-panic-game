import React from 'react';
import { Server } from 'lucide-react';
import { ServiceId, SimulationState } from '../types/simulation';
import { ServiceNode, getStatusVisuals } from './ServiceNode';

interface SystemTopologyProps {
  state: SimulationState;
  selectedService: ServiceId;
  onSelectService: (id: ServiceId) => void;
  reducedMotion: boolean;
}

const NODE_COORDS: Record<ServiceId, { x: number; y: number }> = {
  gateway: { x: 105, y: 155 },
  api: { x: 315, y: 155 },
  redis: { x: 545, y: 60 },
  postgres: { x: 545, y: 155 },
  queue: { x: 545, y: 250 },
  workers: { x: 765, y: 250 }
};

const DEPENDENCY_EXPLANATIONS: Record<ServiceId, string> = {
  gateway:
    'Front door for all user traffic. Throttling here sheds 35% of load across every service downstream.',
  api: 'Calls Redis for fast reads, queries PostgreSQL on cache misses/writes, and publishes async jobs to the Queue.',
  redis:
    'Serves cached reads in <2ms. When Redis fails, 90%+ of reads miss the cache and slam PostgreSQL instead.',
  postgres:
    'Primary database for API queries and Worker writes. High DB load spikes API P99 Latency and 5xx errors.',
  queue:
    'Buffers background jobs from the API. If Workers stall, the queue fills up and slows down API publishing.',
  workers:
    'Pulls jobs from the Queue and writes results to PostgreSQL. Scaling Workers drains queues faster but adds DB write load.'
};

interface ConnectionLink {
  id: string;
  from: ServiceId;
  to: ServiceId;
  label: string;
}

const LINKS: ConnectionLink[] = [
  { id: 'gw-api', from: 'gateway', to: 'api', label: 'HTTP' },
  { id: 'api-redis', from: 'api', to: 'redis', label: 'Cache' },
  { id: 'api-pg', from: 'api', to: 'postgres', label: 'SQL' },
  { id: 'api-q', from: 'api', to: 'queue', label: 'Pub' },
  { id: 'redis-pg', from: 'redis', to: 'postgres', label: 'Miss Stampede' },
  { id: 'q-workers', from: 'queue', to: 'workers', label: 'Jobs' },
  { id: 'workers-pg', from: 'workers', to: 'postgres', label: 'Writes' }
];

export const SystemTopology: React.FC<SystemTopologyProps> = ({
  state,
  selectedService,
  onSelectService,
  reducedMotion
}) => {
  const inspected = state.services[selectedService];
  const inspectedStyle = getStatusVisuals(inspected.status);

  return (
    <section
      aria-label="Distributed System Topology"
      className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 sm:p-4 flex flex-col justify-between"
    >
      {/* Topology Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2">
          <Server className="w-4 h-4 text-cyan-400" />
          <h2 className="font-mono text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-200">
            Live Service Topology (Tap Any Service to Inspect)
          </h2>
        </div>

        {/* Status Legend */}
        <div className="flex items-center gap-3 text-[11px] font-mono text-slate-400">
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400" /> OK
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-400" /> DEG
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-rose-500" /> FAIL
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-cyan-400" /> REC
          </span>
        </div>
      </div>

      {/* Desktop / Tablet Interactive SVG Topology */}
      <div className="hidden sm:block w-full overflow-hidden rounded-lg bg-[#050811] border border-slate-800/90">
        <svg
          viewBox="0 0 880 310"
          className="w-full h-auto max-h-[290px] select-none"
          role="img"
          aria-label="Interactive system architecture diagram with 6 services"
        >
          <defs>
            <pattern
              id="topo-grid"
              width="24"
              height="24"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 24 0 L 0 0 0 24"
                fill="none"
                stroke="rgba(30, 41, 59, 0.4)"
                strokeWidth="1"
              />
            </pattern>
          </defs>
          <rect width="880" height="310" fill="url(#topo-grid)" />

          {/* Dependency Connection Lines + Flowing Request Particles */}
          {LINKS.map((link) => {
            const start = NODE_COORDS[link.from];
            const end = NODE_COORDS[link.to];
            const targetSvc = state.services[link.to];

            const isFallbackLink = link.id === 'redis-pg';
            const fallbackActive =
              isFallbackLink && state.redisAvailability < 60;

            if (isFallbackLink && !fallbackActive) {
              return null;
            }

            const linkColor =
              targetSvc.status === 'FAILED'
                ? '#f43f5e'
                : targetSvc.status === 'DEGRADED'
                ? '#f59e0b'
                : targetSvc.status === 'RECOVERING'
                ? '#06b6d4'
                : '#38bdf8';

            const pathData = `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
            const midX = (start.x + end.x) / 2;
            const midY = (start.y + end.y) / 2;

            return (
              <g key={link.id}>
                <path
                  d={pathData}
                  fill="none"
                  stroke={linkColor}
                  strokeOpacity={0.35}
                  strokeWidth={fallbackActive ? 2.5 : 2}
                  strokeDasharray={fallbackActive ? '5 4' : undefined}
                />
                {!reducedMotion && (
                  <circle r="3.5" fill={linkColor}>
                    <animateMotion
                      dur={
                        targetSvc.status === 'FAILED'
                          ? '2.6s'
                          : state.trafficThrottled
                          ? '1.9s'
                          : '1.15s'
                      }
                      repeatCount="indefinite"
                      path={pathData}
                    />
                  </circle>
                )}
                <rect
                  x={midX - 34}
                  y={midY - 9}
                  width="68"
                  height="16"
                  rx="4"
                  fill="#060911"
                  stroke="rgba(51, 65, 85, 0.7)"
                />
                <text
                  x={midX}
                  y={midY + 2}
                  textAnchor="middle"
                  fill="#94a3b8"
                  fontSize="9"
                  fontFamily="monospace"
                >
                  {link.label}
                </text>
              </g>
            );
          })}

          {/* Service Nodes */}
          {(Object.keys(NODE_COORDS) as ServiceId[]).map((id) => {
            const coords = NODE_COORDS[id];
            return (
              <ServiceNode
                key={id}
                variant="svg"
                service={state.services[id]}
                isSelected={selectedService === id}
                onSelect={() => onSelectService(id)}
                x={coords.x}
                y={coords.y}
              />
            );
          })}
        </svg>
      </div>

      {/* Mobile Compact 2-Column Touch Grid (< 640px) */}
      <div className="grid grid-cols-2 gap-2 sm:hidden">
        {(Object.keys(NODE_COORDS) as ServiceId[]).map((id) => (
          <ServiceNode
            key={id}
            variant="mobile-card"
            service={state.services[id]}
            isSelected={selectedService === id}
            onSelect={() => onSelectService(id)}
          />
        ))}
      </div>

      {/* Selected Service Inspector Footer with Plain-Language Dependency Role */}
      <div className="mt-2.5 pt-2.5 border-t border-slate-800/90 space-y-1 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`w-2.5 h-2.5 rounded-full shrink-0 ${inspectedStyle.dotColor}`}
            />
            <span className="font-mono font-bold text-white">
              {inspected.name}
            </span>
            <span className="font-mono text-slate-300 truncate">
              - {inspected.detail}
            </span>
          </div>

          <div className="flex items-center gap-3 font-mono text-xs shrink-0">
            <span className="text-slate-400">
              {inspected.metricLabel}:{' '}
              <strong className="text-white">{inspected.metricValue}</strong>
            </span>
            <span className={`font-bold ${inspectedStyle.badgeText}`}>
              [{inspected.status} • {inspected.health}%]
            </span>
          </div>
        </div>
        <p className="text-[11px] text-slate-400 font-mono">
          <strong className="text-cyan-300">How it connects:</strong>{' '}
          {DEPENDENCY_EXPLANATIONS[selectedService]}
        </p>
      </div>
    </section>
  );
};

