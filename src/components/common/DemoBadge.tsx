import React from 'react';
import { AlertCircle } from 'lucide-react';

interface DemoBadgeProps {
  message?: string;
  className?: string;
}

export function DemoBanner({
  message = "DEMO & PROTOTYPE MODE: All courts, availability, and prices shown are configurable placeholders. Payments are simulated for verification testing.",
  className = "",
}: DemoBadgeProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs md:text-sm text-amber-900 flex items-center justify-center gap-2 ${className}`}
    >
      <AlertCircle className="w-4 h-4 shrink-0 text-amber-700" />
      <span className="font-medium text-center">{message}</span>
    </div>
  );
}
