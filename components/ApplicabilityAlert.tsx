"use client";

import React from "react";
import { Info, AlertCircle, ChevronRight } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { ApplicabilityResult } from "@/lib/types/result";

interface ApplicabilityAlertProps {
  result: ApplicabilityResult;
}

export function ApplicabilityAlert({ result }: ApplicabilityAlertProps) {
  if (result.isApplicable) {
    return null;
  }

  return (
    <div className="space-y-4">
      <Alert variant="warning">
        <Info className="h-4 w-4" />
        <AlertTitle>This study may not directly apply to you</AlertTitle>
        <AlertDescription>
          Based on your health records, the findings from this study might not be
          directly applicable. Here&apos;s why:
        </AlertDescription>
      </Alert>

      <div className="space-y-3">
        {result.reasons.map((reason, index) => (
          <div
            key={index}
            className="flex gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200"
          >
            <div className="flex-shrink-0">
              <div className="w-8 h-8 rounded-full bg-yellow-100 flex items-center justify-center">
                <AlertCircle className="w-4 h-4 text-yellow-600" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900">
                {reason.description}
              </p>
              {reason.details && (
                <p className="mt-1 text-sm text-gray-500">{reason.details}</p>
              )}
              <div className="mt-2 flex items-center text-xs text-gray-400">
                <span className="capitalize">{reason.type}</span>
                <span className="mx-1">criterion</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="text-sm font-medium text-blue-900 mb-2">
          What you can do
        </h4>
        <ul className="space-y-2">
          <li className="flex items-start gap-2 text-sm text-blue-800">
            <ChevronRight className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>
              Discuss this study with your healthcare provider - they can help
              determine if the findings might still be relevant to your
              situation.
            </span>
          </li>
          <li className="flex items-start gap-2 text-sm text-blue-800">
            <ChevronRight className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>
              Look for similar studies that may have been conducted in
              populations more like yours.
            </span>
          </li>
          <li className="flex items-start gap-2 text-sm text-blue-800">
            <ChevronRight className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>
              If you&apos;re missing lab values, consider asking your doctor if
              those tests would be appropriate for you.
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
}
