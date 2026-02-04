"use client";

import React from "react";
import { User, Activity, Pill, TestTube } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PatientSummary as PatientSummaryType } from "@/lib/types/result";

interface PatientSummaryProps {
  summary: PatientSummaryType;
}

export function PatientSummary({ summary }: PatientSummaryProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <User className="w-4 h-4" />
          Patient Summary
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Demographics */}
        <div>
          <p className="text-sm text-gray-700">
            <span className="font-medium">Age:</span>{" "}
            {summary.age !== null ? `${summary.age} years` : "Unknown"}
          </p>
          <p className="text-sm text-gray-700">
            <span className="font-medium">Sex:</span>{" "}
            <span className="capitalize">{summary.sex}</span>
          </p>
        </div>

        {/* Biomarkers */}
        {summary.relevantBiomarkers.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <TestTube className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-medium text-gray-900">
                Relevant Lab Values
              </span>
            </div>
            <div className="space-y-1.5">
              {summary.relevantBiomarkers.map((bio, index) => (
                <div
                  key={index}
                  className="flex justify-between items-center text-sm bg-gray-50 px-2 py-1.5 rounded"
                >
                  <span className="text-gray-600">{bio.name}</span>
                  <span className="font-medium text-gray-900">
                    {bio.value}
                    {bio.unit && (
                      <span className="text-gray-500 ml-1">{bio.unit}</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Conditions */}
        {summary.relevantConditions.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Activity className="w-4 h-4 text-purple-600" />
              <span className="text-sm font-medium text-gray-900">
                Conditions
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {summary.relevantConditions.slice(0, 5).map((condition, index) => (
                <span
                  key={index}
                  className="text-xs bg-purple-50 text-purple-700 px-2 py-1 rounded"
                >
                  {condition}
                </span>
              ))}
              {summary.relevantConditions.length > 5 && (
                <span className="text-xs text-gray-500 px-2 py-1">
                  +{summary.relevantConditions.length - 5} more
                </span>
              )}
            </div>
          </div>
        )}

        {/* Medications */}
        {summary.relevantMedications.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Pill className="w-4 h-4 text-green-600" />
              <span className="text-sm font-medium text-gray-900">
                Medications
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {summary.relevantMedications.slice(0, 5).map((med, index) => (
                <span
                  key={index}
                  className="text-xs bg-green-50 text-green-700 px-2 py-1 rounded"
                >
                  {med}
                </span>
              ))}
              {summary.relevantMedications.length > 5 && (
                <span className="text-xs text-gray-500 px-2 py-1">
                  +{summary.relevantMedications.length - 5} more
                </span>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
