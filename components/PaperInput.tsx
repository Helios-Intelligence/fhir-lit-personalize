"use client";

import React, { useCallback, useState, useEffect, useRef } from "react";
import { Upload, FileText, X, Loader2, CheckCircle2, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface PaperMetadata {
  title?: string;
  authors?: string[];
  journal?: string;
  pmid?: string;
  doi?: string;
}

interface PaperInputProps {
  onPaperText: (text: string, source: "pdf" | "pmid" | "doi", metadata?: PaperMetadata) => void;
  onError: (error: string) => void;
  disabled?: boolean;
  isLoading?: boolean;
}

function detectIdentifierType(input: string): "pmid" | "doi" | null {
  const trimmed = input.trim();

  // Check for DOI patterns
  if (trimmed.includes("/") || trimmed.startsWith("10.") || trimmed.toLowerCase().startsWith("doi:")) {
    return "doi";
  }

  // Check for PMID (just numbers)
  if (/^\d+$/.test(trimmed)) {
    return "pmid";
  }

  return null;
}

function cleanIdentifier(input: string, type: "pmid" | "doi"): string {
  let cleaned = input.trim();

  if (type === "doi") {
    // Remove common DOI prefixes
    cleaned = cleaned.replace(/^(https?:\/\/)?(dx\.)?doi\.org\//i, "");
    cleaned = cleaned.replace(/^doi:\s*/i, "");
  }

  return cleaned;
}

export function PaperInput({
  onPaperText,
  onError,
  disabled,
  isLoading,
}: PaperInputProps) {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfProcessed, setPdfProcessed] = useState(false);
  const [identifier, setIdentifier] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [fetchedPaper, setFetchedPaper] = useState<PaperMetadata | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const handlePdfUpload = useCallback(
    async (file: File) => {
      setPdfFile(file);
      setPdfProcessed(false);
      setIsUploading(true);
      setFetchedPaper(null);
      setFetchError(null);
      setIdentifier("");

      try {
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch("/api/upload-pdf", {
          method: "POST",
          body: formData,
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to process PDF");
        }

        setPdfProcessed(true);
        onPaperText(data.text, "pdf");
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to upload PDF";
        onError(message);
        setPdfFile(null);
        setPdfProcessed(false);
      } finally {
        setIsUploading(false);
      }
    },
    [onPaperText, onError]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const file = e.dataTransfer.files[0];
      if (file) {
        if (!file.type.includes("pdf")) {
          onError("Please upload a PDF file");
          return;
        }
        handlePdfUpload(file);
      }
    },
    [handlePdfUpload, onError]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handlePdfUpload(file);
      }
    },
    [handlePdfUpload]
  );

  const fetchPaper = useCallback(async (id: string, type: "pmid" | "doi") => {
    const cleanedId = cleanIdentifier(id, type);
    setIsFetching(true);
    setFetchError(null);
    setFetchedPaper(null);

    try {
      const response = await fetch("/api/fetch-paper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: cleanedId,
          type,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 403) {
          // Paper exists but not open access
          setFetchedPaper(data.metadata);
          throw new Error("Paper is not open access. Please upload the PDF.");
        }
        throw new Error(data.error || "Failed to fetch paper");
      }

      setFetchedPaper(data.metadata);
      onPaperText(data.text, type, data.metadata);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to fetch paper";
      setFetchError(message);
      onError(message);
    } finally {
      setIsFetching(false);
    }
  }, [onPaperText, onError]);

  // Auto-detect and fetch when identifier changes
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (!identifier.trim()) {
      setFetchedPaper(null);
      setFetchError(null);
      return;
    }

    const type = detectIdentifierType(identifier);
    if (!type) {
      return;
    }

    // Debounce the fetch
    debounceRef.current = setTimeout(() => {
      fetchPaper(identifier, type);
    }, 500);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [identifier, fetchPaper]);

  const clearPdf = useCallback(() => {
    setPdfFile(null);
    setPdfProcessed(false);
  }, []);

  const clearIdentifier = useCallback(() => {
    setIdentifier("");
    setFetchedPaper(null);
    setFetchError(null);
  }, []);

  const isProcessing = isUploading || isFetching || isLoading;

  return (
    <div className="space-y-4">
      <label className="text-sm font-medium text-gray-700">
        Research Paper
      </label>

      {/* PDF Upload Area */}
      <div
        className={cn(
          "border-2 border-dashed rounded-lg p-4 transition-colors",
          isDragging && "border-blue-500 bg-blue-50",
          !isDragging && "border-gray-300 hover:border-gray-400",
          (disabled || isProcessing) && "opacity-50 pointer-events-none"
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        {pdfFile ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn(
                "p-2 rounded-lg",
                pdfProcessed ? "bg-green-100" : "bg-blue-100"
              )}>
                {isUploading ? (
                  <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                ) : pdfProcessed ? (
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                ) : (
                  <FileText className="w-5 h-5 text-blue-600" />
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">
                  {pdfFile.name}
                </p>
                <p className={cn(
                  "text-xs",
                  pdfProcessed ? "text-green-600" : "text-gray-500"
                )}>
                  {isUploading
                    ? "Extracting text..."
                    : pdfProcessed
                    ? "Text extracted successfully"
                    : `${(pdfFile.size / 1024 / 1024).toFixed(2)} MB`}
                </p>
              </div>
            </div>
            {!isUploading && (
              <Button
                variant="ghost"
                size="icon"
                onClick={clearPdf}
                className="h-8 w-8"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        ) : (
          <div className="text-center py-2">
            <Upload className="mx-auto h-8 w-8 text-gray-400" />
            <div className="mt-2">
              <label className="cursor-pointer">
                <span className="text-sm font-medium text-blue-600 hover:text-blue-500">
                  Upload a PDF
                </span>
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf"
                  onChange={handleInputChange}
                  disabled={disabled || isProcessing}
                />
              </label>
              <span className="text-sm text-gray-500">
                {" "}
                or drag and drop
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className="flex-1 border-t border-gray-200"></div>
        <span className="text-xs text-gray-400 uppercase">or</span>
        <div className="flex-1 border-t border-gray-200"></div>
      </div>

      {/* Identifier Input */}
      <div className="space-y-2">
        <div className="relative">
          <input
            type="text"
            value={identifier}
            onChange={(e) => {
              setIdentifier(e.target.value);
              setPdfFile(null);
            }}
            placeholder="Enter PMID (e.g., 28304224) or DOI (e.g., 10.1056/NEJMoa1615664)"
            className={cn(
              "w-full px-3 py-2 pr-10 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent",
              fetchedPaper && !fetchError ? "border-green-300 bg-green-50" : "border-gray-300",
              fetchError && "border-amber-300 bg-amber-50"
            )}
            disabled={disabled || isProcessing || !!pdfFile}
          />
          {isFetching && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <Loader2 className="h-4 w-4 text-gray-400 animate-spin" />
            </div>
          )}
          {fetchedPaper && !fetchError && !isFetching && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            </div>
          )}
          {identifier && !isFetching && (
            <button
              onClick={clearIdentifier}
              className="absolute right-8 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Paper Info Display */}
        {fetchedPaper && (
          <div className={cn(
            "flex items-start gap-2 p-3 rounded-md text-sm",
            fetchError ? "bg-amber-50 border border-amber-200" : "bg-green-50 border border-green-200"
          )}>
            <BookOpen className={cn(
              "w-4 h-4 mt-0.5 flex-shrink-0",
              fetchError ? "text-amber-600" : "text-green-600"
            )} />
            <div className="flex-1 min-w-0">
              <p className={cn(
                "font-medium leading-tight",
                fetchError ? "text-amber-900" : "text-green-900"
              )}>
                {fetchedPaper.title}
              </p>
              {fetchedPaper.journal && (
                <p className={cn(
                  "text-xs mt-0.5",
                  fetchError ? "text-amber-600" : "text-green-600"
                )}>
                  {fetchedPaper.journal}
                </p>
              )}
              {fetchError && (
                <p className="text-xs text-amber-600 mt-1">{fetchError}</p>
              )}
            </div>
          </div>
        )}

        <p className="text-xs text-gray-500">
          Enter a PubMed ID or DOI. The paper will be fetched automatically.
        </p>
      </div>
    </div>
  );
}
