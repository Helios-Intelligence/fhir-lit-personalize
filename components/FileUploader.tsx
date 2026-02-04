"use client";

import React, { useCallback, useState } from "react";
import { Upload, FileJson, X, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface FileUploaderProps {
  onFileAccepted: (bundle: any) => void;
  onError: (error: string) => void;
  disabled?: boolean;
}

export function FileUploader({ onFileAccepted, onError, disabled }: FileUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [isValid, setIsValid] = useState<boolean | null>(null);

  const handleFile = useCallback(async (file: File) => {
    setFileName(file.name);
    setIsValid(null);

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      // Validate FHIR Bundle structure
      if (!parsed.resourceType || parsed.resourceType !== "Bundle") {
        throw new Error("File must be a FHIR Bundle");
      }

      if (!parsed.entry || !Array.isArray(parsed.entry)) {
        throw new Error("FHIR Bundle must contain entries");
      }

      // Check for required resource types
      const resourceTypes = new Set(
        parsed.entry
          .filter((e: any) => e.resource?.resourceType)
          .map((e: any) => e.resource.resourceType)
      );

      if (!resourceTypes.has("Patient")) {
        throw new Error("FHIR Bundle must contain a Patient resource");
      }

      setIsValid(true);
      onFileAccepted(parsed);
    } catch (error) {
      setIsValid(false);
      const message = error instanceof Error
        ? error.message
        : "Failed to parse FHIR Bundle";
      onError(message);
    }
  }, [onFileAccepted, onError]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const file = e.dataTransfer.files[0];
      if (file) {
        if (!file.name.endsWith(".json")) {
          onError("Please upload a JSON file");
          return;
        }
        handleFile(file);
      }
    },
    [handleFile, onError]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFile(file);
      }
    },
    [handleFile]
  );

  const clearFile = useCallback(() => {
    setFileName(null);
    setIsValid(null);
  }, []);

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-gray-700">
        Patient FHIR Bundle
      </label>
      <div
        className={cn(
          "relative border-2 border-dashed rounded-lg p-6 transition-colors",
          isDragging && "border-blue-500 bg-blue-50",
          !isDragging && "border-gray-300 hover:border-gray-400",
          disabled && "opacity-50 pointer-events-none"
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        {fileName ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  "p-2 rounded-lg",
                  isValid === true && "bg-green-100",
                  isValid === false && "bg-red-100",
                  isValid === null && "bg-gray-100"
                )}
              >
                {isValid === true ? (
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                ) : isValid === false ? (
                  <AlertCircle className="w-5 h-5 text-red-600" />
                ) : (
                  <FileJson className="w-5 h-5 text-gray-600" />
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">{fileName}</p>
                <p
                  className={cn(
                    "text-xs",
                    isValid === true && "text-green-600",
                    isValid === false && "text-red-600",
                    isValid === null && "text-gray-500"
                  )}
                >
                  {isValid === true && "Valid FHIR Bundle"}
                  {isValid === false && "Invalid format"}
                  {isValid === null && "Validating..."}
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={clearFile}
              className="h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="text-center">
            <Upload className="mx-auto h-10 w-10 text-gray-400" />
            <div className="mt-2">
              <label className="cursor-pointer">
                <span className="text-sm font-medium text-blue-600 hover:text-blue-500">
                  Upload a file
                </span>
                <input
                  type="file"
                  className="hidden"
                  accept=".json"
                  onChange={handleInputChange}
                  disabled={disabled}
                />
              </label>
              <span className="text-sm text-gray-500"> or drag and drop</span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              FHIR Bundle JSON file
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
