"use client";

import React from "react";
import { Check, Loader2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PipelineStep } from "@/lib/types/result";
import { PIPELINE_STEPS } from "@/lib/types/result";

interface PipelineProgressProps {
  currentStep: PipelineStep;
  error?: string;
}

export function PipelineProgress({ currentStep, error }: PipelineProgressProps) {
  const getStepStatus = (step: PipelineStep) => {
    if (currentStep === "idle") return "pending";
    if (currentStep === "error") return "error";
    if (currentStep === "complete") return "complete";

    const currentIndex = PIPELINE_STEPS.findIndex(
      (s) => s.step === currentStep
    );
    const stepIndex = PIPELINE_STEPS.findIndex((s) => s.step === step);

    if (stepIndex < currentIndex) return "complete";
    if (stepIndex === currentIndex) return "active";
    return "pending";
  };

  if (currentStep === "idle") {
    return null;
  }

  return (
    <div className="w-full py-4">
      <div className="flex items-center justify-between">
        {PIPELINE_STEPS.map((stepInfo, index) => {
          const status = getStepStatus(stepInfo.step);
          const isLast = index === PIPELINE_STEPS.length - 1;

          return (
            <React.Fragment key={stepInfo.step}>
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all",
                    status === "complete" &&
                      "bg-green-500 border-green-500 text-white",
                    status === "active" &&
                      "bg-blue-500 border-blue-500 text-white",
                    status === "pending" &&
                      "bg-white border-gray-300 text-gray-400",
                    currentStep === "error" &&
                      status === "active" &&
                      "bg-red-500 border-red-500 text-white"
                  )}
                >
                  {status === "complete" ? (
                    <Check className="w-5 h-5" />
                  ) : status === "active" ? (
                    currentStep === "error" ? (
                      <span className="text-sm font-bold">!</span>
                    ) : (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    )
                  ) : (
                    <Circle className="w-5 h-5" />
                  )}
                </div>
                <span
                  className={cn(
                    "mt-2 text-xs font-medium text-center max-w-[80px]",
                    status === "complete" && "text-green-600",
                    status === "active" && !error && "text-blue-600",
                    status === "active" && error && "text-red-600",
                    status === "pending" && "text-gray-400"
                  )}
                >
                  {stepInfo.label}
                </span>
              </div>
              {!isLast && (
                <div
                  className={cn(
                    "flex-1 h-0.5 mx-2 transition-all",
                    getStepStatus(PIPELINE_STEPS[index + 1].step) === "complete"
                      ? "bg-green-500"
                      : getStepStatus(stepInfo.step) === "complete"
                      ? "bg-green-500"
                      : "bg-gray-200"
                  )}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
      {error && (
        <p className="text-center text-sm text-red-600 mt-4">{error}</p>
      )}
    </div>
  );
}
