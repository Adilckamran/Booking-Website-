'use client';

import React, { useState } from 'react';
import { CLUB_CONFIG } from '@/config/clubConfig';
import { copyToClipboard } from '@/utils/clipboard';
import { Copy, Check, Building2, Smartphone, ShieldCheck, AlertCircle } from 'lucide-react';

interface PaymentAccountsCardProps {
  advanceAmount?: number;
  highlightAdvance?: boolean;
}

export function PaymentAccountsCard({
  advanceAmount = 500,
  highlightAdvance = true,
}: PaymentAccountsCardProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const handleCopy = async (text: string, key: string, label: string) => {
    const success = await copyToClipboard(text);
    if (success) {
      setCopiedKey(key);
      setFeedbackMessage(`${label} copied successfully`);
      setTimeout(() => {
        setCopiedKey(null);
        setFeedbackMessage(null);
      }, 2500);
    }
  };

  const faysalIban = CLUB_CONFIG.bankAccount.iban; // "PK16FAYS0127006000003034"
  const easypaisaNumber = CLUB_CONFIG.easypaisaAccount.accountNumber; // "03162997913"
  const easypaisaDisplay = "0316 2997913";

  return (
    <div className="space-y-4">
      {/* Advance Amount Banner */}
      {highlightAdvance && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-900 leading-relaxed">
            <span className="font-bold">Advance Deposit Required: PKR {advanceAmount.toLocaleString()}</span>
            <p className="mt-0.5 text-amber-800">
              Please transfer exactly PKR {advanceAmount.toLocaleString()} to either account below, then upload your payment screenshot with the transaction reference ID. The remaining balance is payable at the venue counter.
            </p>
          </div>
        </div>
      )}

      {/* Toast Feedback */}
      {feedbackMessage && (
        <div className="bg-emerald-600 text-white text-xs font-semibold py-2 px-3 rounded-lg text-center shadow-md animate-fade-in flex items-center justify-center gap-1.5">
          <Check className="w-3.5 h-3.5 stroke-[3]" />
          <span>{feedbackMessage}</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 1. EASYPAISA ACCOUNT */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:border-emerald-300 transition-colors relative">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                <Smartphone className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-700 bg-emerald-100/60 px-1.5 py-0.5 rounded">
                  Mobile Wallet
                </span>
                <h4 className="text-sm font-bold text-slate-900">Easypaisa</h4>
              </div>
            </div>
            <span className="text-[11px] text-slate-500 font-medium">Instant</span>
          </div>

          <div className="space-y-2 text-xs">
            <div>
              <span className="text-[11px] text-slate-500 block">Account Title:</span>
              <span className="font-bold text-slate-900 text-sm">
                {CLUB_CONFIG.easypaisaAccount.accountTitle}
              </span>
            </div>

            <div>
              <span className="text-[11px] text-slate-500 block">Mobile Number:</span>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mt-0.5 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                <span className="font-mono font-bold text-slate-900 tracking-wider text-sm">
                  {easypaisaDisplay}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(easypaisaNumber, 'easypaisa', 'Easypaisa number')}
                  className={`px-3 py-1.5 rounded-md text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all shrink-0 cursor-pointer w-full sm:w-auto ${
                    copiedKey === 'easypaisa'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                  }`}
                  title="Copy Easypaisa Number"
                >
                  {copiedKey === 'easypaisa' ? (
                    <>
                      <Check className="w-3 h-3 stroke-[3]" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Easypaisa Number</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 2. FAYSAL BANK ACCOUNT */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:border-blue-300 transition-colors relative">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                <Building2 className="w-4 h-4" />
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold tracking-wider text-blue-700 bg-blue-100/60 px-1.5 py-0.5 rounded">
                  Bank Transfer / Raast
                </span>
                <h4 className="text-sm font-bold text-slate-900">Faysal Bank</h4>
              </div>
            </div>
            <span className="text-[11px] text-slate-500 font-medium">Any Bank App</span>
          </div>

          <div className="space-y-2 text-xs">
            <div>
              <span className="text-[11px] text-slate-500 block">Account Title:</span>
              <span className="font-bold text-slate-900 text-sm">
                {CLUB_CONFIG.bankAccount.accountTitle}
              </span>
            </div>

            <div>
              <span className="text-[11px] text-slate-500 block">Complete IBAN:</span>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mt-0.5 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                <span className="font-mono font-bold text-slate-900 tracking-wider text-xs break-all">
                  {faysalIban}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(faysalIban, 'faysal', 'IBAN')}
                  className={`px-3 py-1.5 rounded-md text-[11px] font-bold flex items-center justify-center gap-1.5 transition-all shrink-0 cursor-pointer w-full sm:w-auto ${
                    copiedKey === 'faysal'
                      ? 'bg-blue-600 text-white'
                      : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200'
                  }`}
                  title="Copy IBAN"
                >
                  {copiedKey === 'faysal' ? (
                    <>
                      <Check className="w-3 h-3 stroke-[3]" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy IBAN</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
        <span>Official verified accounts of Power Padel Arena management.</span>
      </div>
    </div>
  );
}
