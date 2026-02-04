"use client";

import React, { useState } from "react";
import { Copy, Check, BookOpen, User, BarChart3, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { PersonalizedResult as PersonalizedResultType } from "@/lib/types/result";

interface PersonalizedResultProps {
  result: PersonalizedResultType;
}

export function PersonalizedResult({ result }: PersonalizedResultProps) {
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  const copyToClipboard = async (text: string, section: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSection(section);
      setTimeout(() => setCopiedSection(null), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const sections = [
    {
      key: "studySummary",
      title: "Study Summary",
      content: result.studySummary,
      icon: BookOpen,
      color: "blue",
    },
    {
      key: "contextualizedRisk",
      title: "Putting The Numbers In Context",
      content: result.contextualizedRisk,
      icon: BarChart3,
      color: "green",
    },
    {
      key: "patientProjection",
      title: "What This Means For You",
      content: result.patientProjection,
      icon: User,
      color: "purple",
    },
    {
      key: "suggestedAction",
      title: "Suggested Next Step",
      content: result.suggestedAction,
      icon: ArrowRight,
      color: "amber",
    },
  ];

  const colorClasses = {
    blue: {
      bg: "bg-blue-50",
      border: "border-blue-200",
      icon: "text-blue-600",
      title: "text-blue-900",
    },
    purple: {
      bg: "bg-purple-50",
      border: "border-purple-200",
      icon: "text-purple-600",
      title: "text-purple-900",
    },
    green: {
      bg: "bg-green-50",
      border: "border-green-200",
      icon: "text-green-600",
      title: "text-green-900",
    },
    amber: {
      bg: "bg-amber-50",
      border: "border-amber-200",
      icon: "text-amber-600",
      title: "text-amber-900",
    },
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">
        Personalized Findings
      </h2>
      <div className="space-y-4">
        {sections.map((section) => {
          const colors = colorClasses[section.color as keyof typeof colorClasses];
          const Icon = section.icon;

          return (
            <Card
              key={section.key}
              className={`${colors.bg} ${colors.border} border`}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className={`w-5 h-5 ${colors.icon}`} />
                    <CardTitle className={`text-base ${colors.title}`}>
                      {section.title}
                    </CardTitle>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() =>
                      copyToClipboard(section.content, section.key)
                    }
                  >
                    {copiedSection === section.key ? (
                      <Check className="h-4 w-4 text-green-600" />
                    ) : (
                      <Copy className="h-4 w-4 text-gray-400" />
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-gray-700 leading-relaxed">
                  {section.content}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
        <p className="text-xs text-gray-500">
          <strong>Important:</strong> This personalized summary is based on a
          research study and your health data. It is not medical advice. Always
          discuss treatment decisions with your healthcare provider. Individual
          results may vary from study findings.
        </p>
      </div>
    </div>
  );
}
