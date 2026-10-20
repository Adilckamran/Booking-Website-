import React from 'react';
import { BookingStatus } from '@/types';
import { Clock, AlertTriangle, CheckCircle2, XCircle, Ban, Hourglass } from 'lucide-react';

interface StatusBadgeProps {
  status: BookingStatus;
  size?: 'sm' | 'md' | 'lg';
}

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const configs: Record<
    BookingStatus,
    { label: string; bg: string; text: string; border: string; icon: React.ReactNode }
  > = {
    awaiting_payment: {
      label: 'Awaiting Payment',
      bg: 'bg-amber-50',
      text: 'text-amber-800',
      border: 'border-amber-200',
      icon: <Clock className="w-3.5 h-3.5 text-amber-600" />,
    },
    payment_under_review: {
      label: 'Payment Under Review',
      bg: 'bg-blue-50',
      text: 'text-blue-800',
      border: 'border-blue-200',
      icon: <Hourglass className="w-3.5 h-3.5 text-blue-600" />,
    },
    confirmed: {
      label: 'Confirmed',
      bg: 'bg-emerald-50',
      text: 'text-emerald-800',
      border: 'border-emerald-200',
      icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />,
    },
    rejected: {
      label: 'Payment Rejected',
      bg: 'bg-rose-50',
      text: 'text-rose-800',
      border: 'border-rose-200',
      icon: <XCircle className="w-3.5 h-3.5 text-rose-600" />,
    },
    expired: {
      label: 'Hold Expired',
      bg: 'bg-zinc-100',
      text: 'text-zinc-700',
      border: 'border-zinc-300',
      icon: <AlertTriangle className="w-3.5 h-3.5 text-zinc-500" />,
    },
    cancelled: {
      label: 'Cancelled',
      bg: 'bg-slate-100',
      text: 'text-slate-700',
      border: 'border-slate-300',
      icon: <Ban className="w-3.5 h-3.5 text-slate-500" />,
    },
  };

  const current = configs[status] || configs.awaiting_payment;

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5 gap-1',
    md: 'text-xs md:text-sm px-2.5 py-1 gap-1.5',
    lg: 'text-sm md:text-base px-3.5 py-1.5 gap-2 font-medium',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full border font-medium ${current.bg} ${current.text} ${current.border} ${sizeClasses[size]}`}
    >
      {current.icon}
      <span>{current.label}</span>
    </span>
  );
}
