import React from 'react';

interface SparklineProps {
    data: number[];
    min: number;
    max: number;
    color: string;
}

export const Sparkline: React.FC<SparklineProps> = ({
    data,
    min,
    max,
    color
}) => {
    const width = 120;
    const height = 28;

    if (data.length < 2) return null;

    const range = Math.max(1, max - min);
    const points = data
        .map((val, idx) => {
            const x = (idx / Math.max(1, data.length - 1)) * width;
            const normalized = Math.max(0, Math.min(1, (val - min) / range));
            const y = height - normalized * (height - 6) - 3;
            return `${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(' ');

    return (
        <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            className="overflow-visible shrink-0"
            aria-hidden="true"
        >
            <polyline
                fill="none"
                stroke={color}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={points}
            />
        </svg>
    );
};