import React from 'react';
import { SimulationState } from '../types/simulation';
import { Sparkline } from './Sparkline';

interface MetricsPanelProps {
  state: SimulationState;
}

export const MetricsPanel: React.FC<MetricsPanelProps> = ({ state }) => {
  const cards = [
    {
      id: 'throughput',
      label: 'Customer Traffic',
      value: `${state.throughput.toLocaleString()} req/s`,
      sub: state.trafficThrottled
        ? 'Throttled (-35% load shed)'
        : '100% ingress open',
      plainTip: 'Successful requests/sec',
      data: state.history.throughput,
      min: 150,
      max: 1500,
      color: state.trafficThrottled ? '#38bdf8' : '#10b981',
      alert: false
    },
    {
      id: 'latency',
      label: 'API P99 Latency',
      value: `${state.latency} ms`,
      sub:
        state.latency > 550
          ? 'SLA Breach (>500ms)'
          : state.latency > 280
          ? 'Slow responses'
          : 'Fast (<250ms)',
      plainTip: 'Slowest 1% response time',
      data: state.history.latency,
      min: 50,
      max: 1400,
      color:
        state.latency > 550
          ? '#f43f5e'
          : state.latency > 280
          ? '#f59e0b'
          : '#10b981',
      alert: state.latency > 550
    },
    {
      id: 'errors',
      label: 'Failed Requests (5xx)',
      value: `${state.errorRate.toFixed(1)}%`,
      sub:
        state.errorRate > 12
          ? 'Critical error spike'
          : state.errorRate > 5
          ? 'Elevated failures'
          : 'Healthy (<5% SLA)',
      plainTip: '% of users seeing errors',
      data: state.history.errorRate,
      min: 0,
      max: 45,
      color:
        state.errorRate > 12
          ? '#f43f5e'
          : state.errorRate > 5
          ? '#f59e0b'
          : '#10b981',
      alert: state.errorRate > 12
    },
    {
      id: 'queue',
      label: 'Queue Backlog',
      value: `${state.queueDepth.toLocaleString()}`,
      sub:
        state.queueDepth > 1400
          ? 'Backlog surging!'
          : state.queueDepth > 500
          ? 'Draining backlog'
          : 'Queue nominal',
      plainTip: 'Waiting background jobs',
      data: state.history.queueDepth,
      min: 0,
      max: 3200,
      color:
        state.queueDepth > 1400
          ? '#f43f5e'
          : state.queueDepth > 500
          ? '#f59e0b'
          : '#10b981',
      alert: state.queueDepth > 1400
    }
  ];

  return (
    <section
      aria-label="Live System Telemetry"
      className="grid grid-cols-2 xl:grid-cols-4 gap-2.5"
    >
      {cards.map((card) => (
        <div
          key={card.id}
          className={`bg-slate-900/85 rounded-xl p-3 border transition-colors ${
            card.alert
              ? 'border-rose-500/60 bg-rose-950/15'
              : 'border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between gap-1 mb-0.5">
            <span className="font-mono text-[11px] uppercase tracking-wider text-slate-300 font-bold">
              {card.label}
            </span>
            {card.alert && (
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
            )}
          </div>
          <div className="text-[10px] text-slate-400 font-mono mb-1">
            {card.plainTip}
          </div>

          <div className="flex items-end justify-between gap-2">
            <div>
              <div className="font-mono text-base sm:text-xl font-black text-white leading-tight">
                {card.value}
              </div>
              <div className="font-mono text-[10px] sm:text-[11px] text-slate-300 mt-0.5 truncate">
                {card.sub}
              </div>
            </div>

            <div className="hidden sm:block">
              <Sparkline
                data={card.data}
                min={card.min}
                max={card.max}
                color={card.color}
              />
            </div>
          </div>
        </div>
      ))}
    </section>
  );
};

