"use client";

import React, { useCallback, useState } from "react";
import { Upload, FileText, X, Search, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface PaperInputProps {
  onPaperText: (text: string, source: "pdf" | "pmid" | "doi") => void;
  onError: (error: string) => void;
  disabled?: boolean;
  isLoading?: boolean;
}

export function PaperInput({
  onPaperText,
  onError,
  disabled,
  isLoading,
}: PaperInputProps) {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [identifier, setIdentifier] = useState("");
  const [identifierType, setIdentifierType] = useState<"pmid" | "doi">("pmid");
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);

  const handlePdfUpload = useCallback(
    async (file: File) => {
      setPdfFile(file);
      setIsUploading(true);

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

        onPaperText(data.text, "pdf");
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to upload PDF";
        onError(message);
        setPdfFile(null);
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

  const handleIdentifierSubmit = useCallback(async () => {
    if (!identifier.trim()) {
      onError("Please enter a PMID or DOI");
      return;
    }

    setIsFetching(true);

    try {
      const response = await fetch("/api/fetch-paper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identifier: identifier.trim(),
          type: identifierType,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error(
            data.error || "Paper is not open access. Please upload the PDF."
          );
        }
        throw new Error(data.error || "Failed to fetch paper");
      }

      onPaperText(data.text, identifierType);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to fetch paper";
      onError(message);
    } finally {
      setIsFetching(false);
    }
  }, [identifier, identifierType, onPaperText, onError]);

  const clearPdf = useCallback(() => {
    setPdfFile(null);
  }, []);

  const isProcessing = isUploading || isFetching || isLoading;

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-gray-700">
        Research Paper
      </label>
      <Tabs defaultValue="pdf" className="w-full">
        <TabsList className="w-full">
          <TabsTrigger value="pdf" className="flex-1">
            Upload PDF
          </TabsTrigger>
          <TabsTrigger value="identifier" className="flex-1">
            PMID / DOI
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pdf">
          <div
            className={cn(
              "border-2 border-dashed rounded-lg p-6 transition-colors",
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
                  <div className="p-2 rounded-lg bg-blue-100">
                    {isUploading ? (
                      <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                    ) : (
                      <FileText className="w-5 h-5 text-blue-600" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {pdfFile.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {isUploading
                        ? "Extracting text..."
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
              <div className="text-center">
                <Upload className="mx-auto h-10 w-10 text-gray-400" />
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
                <p className="text-xs text-gray-500 mt-1">PDF up to 20MB</p>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="identifier">
          <div className="space-y-3">
            <div className="flex gap-2">
              <Button
                variant={identifierType === "pmid" ? "default" : "outline"}
                size="sm"
                onClick={() => setIdentifierType("pmid")}
                disabled={disabled || isProcessing}
              >
                PMID
              </Button>
              <Button
                variant={identifierType === "doi" ? "default" : "outline"}
                size="sm"
                onClick={() => setIdentifierType("doi")}
                disabled={disabled || isProcessing}
              >
                DOI
              </Button>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder={
                  identifierType === "pmid"
                    ? "e.g., 28864332"
                    : "e.g., 10.1056/NEJMoa1707914"
                }
                className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={disabled || isProcessing}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !disabled && !isProcessing) {
                    handleIdentifierSubmit();
                  }
                }}
              />
              <Button
                onClick={handleIdentifierSubmit}
                disabled={disabled || isProcessing || !identifier.trim()}
              >
                {isFetching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-gray-500">
              Enter a PubMed ID or DOI. Only open access papers can be fetched
              directly.
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
