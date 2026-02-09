"use client";

import React, { useState } from "react";
import { ChevronDown, ChevronRight, Coins } from "lucide-react";
import type { TokenUsageSummary } from "@/lib/token-tracker";

interface TokenUsageDisplayProps {
  usage: TokenUsageSummary;
}

function formatCost(cost: number): string {
  if (cost < 0.001) return "<$0.001";
  return `$${cost.toFixed(4)}`;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}k`;
  return String(tokens);
}

export function TokenUsageDisplay({ usage }: TokenUsageDisplayProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm text-gray-500 hover:text-gray-700 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Coins className="w-4 h-4" />
          <span>
            LLM Usage: {formatTokens(usage.totalInputTokens + usage.totalOutputTokens)} tokens &middot; {formatCost(usage.totalCost)}
          </span>
        </div>
        {expanded ? (
          <ChevronDown className="w-4 h-4" />
        ) : (
          <ChevronRight className="w-4 h-4" />
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-3">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-400 border-b border-gray-100">
                <th className="text-left py-1.5 font-medium">Step</th>
                <th className="text-right py-1.5 font-medium">Input</th>
                <th className="text-right py-1.5 font-medium">Output</th>
                <th className="text-right py-1.5 font-medium">Cost</th>
              </tr>
            </thead>
            <tbody>
              {usage.calls.map((call, i) => (
                <tr key={i} className="text-gray-500 border-b border-gray-50">
                  <td className="py-1.5">{call.step}</td>
                  <td className="text-right py-1.5 tabular-nums">
                    {formatTokens(call.inputTokens)}
                  </td>
                  <td className="text-right py-1.5 tabular-nums">
                    {formatTokens(call.outputTokens)}
                  </td>
                  <td className="text-right py-1.5 tabular-nums">
                    {formatCost(call.totalCost)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="text-gray-700 font-medium border-t border-gray-200">
                <td className="py-1.5">Total</td>
                <td className="text-right py-1.5 tabular-nums">
                  {formatTokens(usage.totalInputTokens)}
                </td>
                <td className="text-right py-1.5 tabular-nums">
                  {formatTokens(usage.totalOutputTokens)}
                </td>
                <td className="text-right py-1.5 tabular-nums">
                  {formatCost(usage.totalCost)}
                </td>
              </tr>
            </tfoot>
          </table>
          <p className="text-[10px] text-gray-400 mt-2">
            Model: {usage.calls[0]?.model || "gemini-2.0-flash"} &middot; Input: $0.10/1M tokens &middot; Output: $0.40/1M tokens
          </p>
        </div>
      )}
    </div>
  );
}
