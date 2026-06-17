import React from 'react';
import classNames from 'classnames';

interface CircularProgressRingProps {
  percentage: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
  sublabel?: string;
  className?: string;
  trackColor?: string;
  progressColor?: string;
}

const CircularProgressRing: React.FC<CircularProgressRingProps> = ({
  percentage,
  size = 112,
  strokeWidth = 3,
  label,
  sublabel,
  className,
  trackColor = '#e5e7eb',
  progressColor = '#7c3aed',
}) => {
  const clamped = Math.min(100, Math.max(0, percentage));
  const radius = 15.9;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (clamped / 100) * circumference;

  return (
    <div
      className={classNames('flex flex-col items-center', className)}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? `Progress ${clamped}%`}
    >
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          viewBox="0 0 36 36"
          className="w-full h-full -rotate-90"
          aria-hidden="true"
        >
          <circle
            cx="18"
            cy="18"
            r={radius}
            fill="none"
            stroke={trackColor}
            strokeWidth={strokeWidth}
          />
          <circle
            cx="18"
            cy="18"
            r={radius}
            fill="none"
            stroke={progressColor}
            strokeWidth={strokeWidth}
            strokeDasharray={`${circumference}`}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            className="transition-all duration-700 ease-out"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-2xl font-bold text-purple-700">
          {clamped}%
        </span>
      </div>
      {label && (
        <p className="mt-2 text-sm font-semibold text-gray-800 text-center">{label}</p>
      )}
      {sublabel && (
        <p className="text-xs text-gray-500 text-center mt-0.5">{sublabel}</p>
      )}
    </div>
  );
};

export default CircularProgressRing;
