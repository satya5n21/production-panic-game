import React from 'react';
import { ServiceState, ServiceStatus } from '../types/simulation';

export interface StatusVisualStyle {
    stroke: string;
    fill: string;
    badgeBg: string;
    badgeText: string;
    label: string;
    dotColor: string;
}

export function getStatusVisuals(status: ServiceStatus): StatusVisualStyle {
    switch (status) {
        case 'HEALTHY':
            return {
                stroke: '#10b981',
                fill: '#06281e',
                badgeBg: 'bg-emerald-950/90 border-emerald-500/50',
                badgeText: 'text-emerald-300',
                label: 'OK',
                dotColor: 'bg-emerald-400'
            };
        case 'RECOVERING':
            return {
                stroke: '#06b6d4',
                fill: '#082633',
                badgeBg: 'bg-cyan-950/90 border-cyan-500/50',
                badgeText: 'text-cyan-300',
                label: 'REC',
                dotColor: 'bg-cyan-400'
            };
        case 'DEGRADED':
            return {
                stroke: '#f59e0b',
                fill: '#2b1c07',
                badgeBg: 'bg-amber-950/90 border-amber-500/50',
                badgeText: 'text-amber-300',
                label: 'DEG',
                dotColor: 'bg-amber-400'
            };
        case 'FAILED':
            return {
                stroke: '#f43f5e',
                fill: '#300a14',
                badgeBg: 'bg-rose-950/90 border-rose-500/70',
                badgeText: 'text-rose-300',
                label: 'FAIL',
                dotColor: 'bg-rose-500'
            };
    }
}

interface ServiceNodeProps {
    service: ServiceState;
    isSelected: boolean;
    onSelect: () => void;
    variant: 'svg' | 'mobile-card';
    x?: number;
    y?: number;
}

export const ServiceNode: React.FC<ServiceNodeProps> = ({
    service,
    isSelected,
    onSelect,
    variant,
    x = 0,
    y = 0
}) => {
    const style = getStatusVisuals(service.status);

    if (variant === 'mobile-card') {
        return (
            <button
                type="button"
                onClick={onSelect}
                className={`text-left p-2.5 rounded-xl border transition-all min-h-[68px] flex flex-col justify-between ${isSelected ? 'ring-2 ring-cyan-400' : ''
                    } ${style.badgeBg}`}
            >
                <div className="flex items-center justify-between gap-1 w-full">
                    <span className="font-mono font-bold text-xs text-white truncate">
                        {service.shortName}
                    </span>
                    <span
                        className={`font-mono text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-slate-950/90 ${style.badgeText}`}
                    >
                        {style.label} {service.health}%
                    </span>
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[11px] font-mono text-slate-300">
                    <span className="text-slate-400">{service.metricLabel}:</span>
                    <span className="font-bold text-white">{service.metricValue}</span>
                </div>
            </button>
        );
    }

    return (
        <g
            transform={`translate(${x - 85}, ${y - 40})`}
            onClick={onSelect}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect();
                }
            }}
            tabIndex={0}
            role="button"
            aria-label={`${service.name}: status ${service.status}, health ${service.health}%, ${service.metricLabel} ${service.metricValue}`}
            className="cursor-pointer focus:outline-none"
        >
            {/* Selection outer ring */}
            {isSelected && (
                <rect
                    x="-4"
                    y="-4"
                    width="178"
                    height="88"
                    rx="14"
                    fill="none"
                    stroke="#22d3ee"
                    strokeWidth="2"
                    strokeDasharray="4 3"
                />
            )}

            {/* Main Node Body */}
            <rect
                x="0"
                y="0"
                width="170"
                height="80"
                rx="10"
                fill={style.fill}
                stroke={style.stroke}
                strokeWidth={service.status === 'FAILED' ? '2.5' : '1.8'}
            />

            {/* Top row: Service Name + Status Pill */}
            <text
                x="12"
                y="22"
                fill="#f8fafc"
                fontSize="12.5"
                fontWeight="700"
                fontFamily="monospace"
            >
                {service.name}
            </text>

            <rect
                x="122"
                y="9"
                width="38"
                height="18"
                rx="4"
                fill="#090d16"
                stroke={style.stroke}
                strokeWidth="1"
            />
            <text
                x="141"
                y="21"
                textAnchor="middle"
                fill={style.stroke}
                fontSize="10"
                fontWeight="800"
                fontFamily="monospace"
            >
                {style.label}
            </text>

            {/* Middle row: Key metric */}
            <text x="12" y="43" fill="#94a3b8" fontSize="11" fontFamily="monospace">
                {service.metricLabel}:{' '}
                <tspan fill="#ffffff" fontWeight="700">
                    {service.metricValue}
                </tspan>
            </text>

            {/* Bottom Health Bar */}
            <rect x="12" y="56" width="115" height="7" rx="3.5" fill="#090d16" />
            <rect
                x="12"
                y="56"
                width={Math.max(4, Math.round((service.health / 100) * 115))}
                height="7"
                rx="3.5"
                fill={style.stroke}
            />
            <text
                x="158"
                y="63"
                textAnchor="end"
                fill="#e2e8f0"
                fontSize="11"
                fontWeight="700"
                fontFamily="monospace"
            >
                {service.health}%
            </text>
        </g>
    );
};