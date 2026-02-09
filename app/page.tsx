"use client";

import React, { useState, useCallback } from "react";
import { Sparkles, AlertCircle } from "lucide-react";
import { FileUploader } from "@/components/FileUploader";
import { PaperInput } from "@/components/PaperInput";
import { PipelineProgress } from "@/components/PipelineProgress";
import { PersonalizedResult } from "@/components/PersonalizedResult";
import { ApplicabilityAlert } from "@/components/ApplicabilityAlert";
import { PatientSummary } from "@/components/PatientSummary";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { TokenUsageDisplay } from "@/components/TokenUsageDisplay";
import type { PipelineStep, PipelineResult } from "@/lib/types/result";
import type { TokenUsageSummary, LLMCallUsage } from "@/lib/token-tracker";
import type { ParsedPaper } from "@/lib/types/paper";
import { extractPatientDataClient } from "@/lib/fhir-extractor-client";

interface PaperMetadata {
  title?: string;
  authors?: string[];
  journal?: string;
  pmid?: string;
  doi?: string;
}

export default function Home() {
  const [fhirBundle, setFhirBundle] = useState<any>(null);
  const [extractedPatient, setExtractedPatient] = useState<any>(null);
  const [paperText, setPaperText] = useState<string | null>(null);
  const [paperSource, setPaperSource] = useState<"pdf" | "pmid" | "doi" | null>(
    null
  );
  const [paperMetadata, setPaperMetadata] = useState<PaperMetadata | null>(null);
  const [pdfBase64, setPdfBase64] = useState<string | null>(null);
  const [includeFigures, setIncludeFigures] = useState(true);
  const [parsedPaper, setParsedPaper] = useState<ParsedPaper | null>(null);
  const [currentStep, setCurrentStep] = useState<PipelineStep>("idle");
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [tokenUsage, setTokenUsage] = useState<TokenUsageSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFhirAccepted = useCallback((bundle: any | null) => {
    if (bundle === null) {
      // File was cleared
      setFhirBundle(null);
      setExtractedPatient(null);
      return;
    }

    setFhirBundle(bundle);
    setError(null);

    // Extract patient data client-side immediately
    try {
      const extracted = extractPatientDataClient(bundle);
      setExtractedPatient(extracted);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to extract patient data";
      setError(msg);
    }
  }, []);

  const handlePaperText = useCallback(
    (text: string, source: "pdf" | "pmid" | "doi", metadata?: PaperMetadata, pdf?: string) => {
      setPaperText(text);
      setPaperSource(source);
      setPaperMetadata(metadata || null);
      setPdfBase64(pdf || null);
      setError(null);
    },
    []
  );

  const handleError = useCallback((errorMsg: string) => {
    setError(errorMsg);
  }, []);

  const runPipeline = async () => {
    if (!extractedPatient || !paperText) return;

    setError(null);
    setResult(null);
    setParsedPaper(null);
    setTokenUsage(null);

    try {
      // Step 1: Parse paper (with optional PDF for figure extraction)
      setCurrentStep("parsing-paper");
      const parseBody: Record<string, unknown> = {
        paperText,
        source: paperSource,
        metadata: paperMetadata,
      };
      if (includeFigures && pdfBase64) {
        parseBody.pdfBase64 = pdfBase64;
      }
      const parseResponse = await fetch("/api/parse-paper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parseBody),
      });

      const parseData = await parseResponse.json();
      if (!parseResponse.ok) {
        throw new Error(parseData.error || "Failed to parse paper");
      }

      const parsed = parseData.parsedPaper as ParsedPaper;
      const parseUsageCalls: LLMCallUsage[] = parseData.tokenUsage?.calls || [];

      // Use metadata title if parsed title is missing
      if (!parsed.title && paperMetadata?.title) {
        parsed.title = paperMetadata.title;
      }

      setParsedPaper(parsed);

      // Steps 2-4: Personalize
      setCurrentStep("extracting-patient");

      // Small delay to show the step
      await new Promise((resolve) => setTimeout(resolve, 500));

      setCurrentStep("checking-applicability");

      // Send only extracted patient data (not the full FHIR bundle)
      const personalizeResponse = await fetch("/api/personalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          extractedPatient,
          parsedPaper: parsed,
        }),
      });

      const personalizeData = await personalizeResponse.json();

      if (!personalizeResponse.ok) {
        throw new Error(personalizeData.error || "Failed to personalize");
      }

      // If applicable, we generated output
      if (personalizeData.applicability?.isApplicable) {
        setCurrentStep("generating-output");
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      // Aggregate token usage from both API calls
      const personalizeCalls: LLMCallUsage[] = personalizeData.tokenUsage?.calls || [];
      const allCalls = [...parseUsageCalls, ...personalizeCalls];
      const combinedUsage: TokenUsageSummary = {
        calls: allCalls,
        totalInputTokens: allCalls.reduce((s, c) => s + c.inputTokens, 0),
        totalOutputTokens: allCalls.reduce((s, c) => s + c.outputTokens, 0),
        totalCost: allCalls.reduce((s, c) => s + c.totalCost, 0),
      };
      setTokenUsage(combinedUsage);

      setResult(personalizeData);
      setCurrentStep("complete");
    } catch (err) {
      setCurrentStep("error");
      const message =
        err instanceof Error ? err.message : "An unexpected error occurred";
      setError(message);
    }
  };

  const resetPipeline = () => {
    setFhirBundle(null);
    setExtractedPatient(null);
    setPaperText(null);
    setPaperSource(null);
    setPaperMetadata(null);
    setPdfBase64(null);
    setParsedPaper(null);
    setCurrentStep("idle");
    setResult(null);
    setTokenUsage(null);
    setError(null);
  };

  const isProcessing = !["idle", "complete", "error"].includes(currentStep);
  // Can run if we have data and not currently processing
  const canRun = extractedPatient && paperText && !isProcessing;

  // Get display title from metadata or parsed paper
  const displayTitle = parsedPaper?.title || paperMetadata?.title;

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">
                FHIR Literature Personalization
              </h1>
              <p className="text-sm text-gray-500">
                Personalize research findings based on your health data
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column: Upload */}
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Upload Your Data
              </h2>
              <div className="space-y-6">
                <FileUploader
                  onFileAccepted={handleFhirAccepted}
                  onError={handleError}
                  disabled={isProcessing}
                />
                <PaperInput
                  onPaperText={handlePaperText}
                  onError={handleError}
                  disabled={isProcessing}
                />
              </div>

              {/* Error Display */}
              {error && currentStep === "idle" && (
                <Alert variant="destructive" className="mt-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {/* Figure extraction toggle */}
              {pdfBase64 && (
                <div className="mt-4">
                  <label className="flex items-center gap-2 px-3 py-2 rounded-md bg-purple-50 border border-purple-200 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={includeFigures}
                      onChange={(e) => setIncludeFigures(e.target.checked)}
                      className="rounded border-purple-300 text-purple-600 focus:ring-purple-500"
                      disabled={isProcessing}
                    />
                    <span className="text-sm text-purple-800">
                      Include figures &amp; tables
                    </span>
                    <span className="text-xs text-purple-500">
                      (sends PDF to AI for visual analysis)
                    </span>
                  </label>
                </div>
              )}

              {/* Action Buttons */}
              <div className="mt-6 flex gap-3">
                <Button
                  onClick={runPipeline}
                  disabled={!canRun}
                  className="flex-1"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  Personalize Findings
                </Button>
                {(result || error) && (
                  <Button variant="outline" onClick={resetPipeline}>
                    Start Over
                  </Button>
                )}
              </div>
            </div>

            {/* Pipeline Progress */}
            {currentStep !== "idle" && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <PipelineProgress
                  currentStep={currentStep}
                  error={currentStep === "error" ? error || undefined : undefined}
                />
              </div>
            )}

            {/* Patient Summary */}
            {result?.patientSummary && (
              <PatientSummary summary={result.patientSummary} />
            )}
          </div>

          {/* Right Column: Results */}
          <div className="space-y-6">
            {/* Paper Summary */}
            {parsedPaper && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h3 className="text-base font-semibold text-gray-900 mb-3">
                  Study: {displayTitle || "Untitled"}
                </h3>
                <div className="space-y-2 text-sm">
                  {parsedPaper.intervention && (
                    <p>
                      <span className="font-medium text-gray-700">
                        Intervention:
                      </span>{" "}
                      <span className="text-gray-600">
                        {parsedPaper.intervention}
                      </span>
                    </p>
                  )}
                  {parsedPaper.primaryEndpoint && (
                    <p>
                      <span className="font-medium text-gray-700">
                        Primary Endpoint:
                      </span>{" "}
                      <span className="text-gray-600">
                        {parsedPaper.primaryEndpoint}
                      </span>
                    </p>
                  )}
                  {parsedPaper.followUpDuration && (
                    <p>
                      <span className="font-medium text-gray-700">Follow-up:</span>{" "}
                      <span className="text-gray-600">
                        {parsedPaper.followUpDuration}
                      </span>
                    </p>
                  )}
                  {parsedPaper.biomarkerEffects && Object.entries(parsedPaper.biomarkerEffects).map(([biomarker, effect]) => (
                    effect?.percentReduction && (
                      <p key={biomarker}>
                        <span className="font-medium text-gray-700">
                          {biomarker} Reduction:
                        </span>{" "}
                        <span className="text-gray-600">
                          {(effect.percentReduction * 100).toFixed(0)}%
                          {effect.baselineValue && effect.achievedValue && (
                            <span className="text-gray-400 ml-1">
                              ({effect.baselineValue} → {effect.achievedValue} {effect.unit || ''})
                            </span>
                          )}
                        </span>
                      </p>
                    )
                  ))}
                  {parsedPaper.keyFindings.hazardRatio && (
                    <p>
                      <span className="font-medium text-gray-700">
                        Hazard Ratio:
                      </span>{" "}
                      <span className="text-gray-600">
                        {parsedPaper.keyFindings.hazardRatio}
                        {parsedPaper.keyFindings.hazardRatioCI && (
                          <span className="text-gray-400 ml-1">
                            (95% CI:{" "}
                            {parsedPaper.keyFindings.hazardRatioCI.lower}-
                            {parsedPaper.keyFindings.hazardRatioCI.upper})
                          </span>
                        )}
                      </span>
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Results */}
            {result && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                {result.applicability && !result.applicability.isApplicable ? (
                  <ApplicabilityAlert result={result.applicability} />
                ) : result.personalizedResult ? (
                  <PersonalizedResult result={result.personalizedResult} />
                ) : null}
              </div>
            )}

            {/* Token Usage */}
            {tokenUsage && tokenUsage.calls.length > 0 && (
              <TokenUsageDisplay usage={tokenUsage} />
            )}

            {/* Placeholder when no results */}
            {!result && currentStep === "idle" && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="text-center py-12">
                  <Sparkles className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    Ready to personalize
                  </h3>
                  <p className="text-sm text-gray-500 max-w-sm mx-auto">
                    Upload your FHIR health data and a research paper to see
                    personalized findings tailored to your health profile.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
