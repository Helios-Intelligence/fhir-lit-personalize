import { z } from 'zod';
import type { ExtractedPatient } from './patient';
import type { ParsedPaper } from './paper';

/**
 * Schema for personalized result from LLM
 */
export const PersonalizedResultSchema = z.object({
  studySummary: z.string().describe('1-2 sentence summary of the study findings'),
  patientProjection: z.string().describe('Patient-specific projection applying effect sizes to actual values'),
  contextualizedRisk: z.string().describe('"N out of 100" framing for risk contextualization'),
});

export type PersonalizedResult = z.infer<typeof PersonalizedResultSchema>;

/**
 * Applicability check result
 */
export interface ApplicabilityResult {
  isApplicable: boolean;
  reasons: ApplicabilityReason[];
}

export interface ApplicabilityReason {
  type: 'age' | 'condition' | 'medication' | 'biomarker' | 'exclusion';
  description: string;
  details?: string;
}

/**
 * Full pipeline result
 */
export interface PipelineResult {
  success: boolean;
  applicability?: ApplicabilityResult;
  personalizedResult?: PersonalizedResult;
  patientSummary?: PatientSummary;
  paperSummary?: PaperSummary;
  error?: string;
}

/**
 * Summary of extracted patient data for display
 */
export interface PatientSummary {
  age: number | null;
  sex: string;
  relevantBiomarkers: Array<{
    name: string;
    value: string;
    unit?: string;
    date: string;
  }>;
  relevantConditions: string[];
  relevantMedications: string[];
}

/**
 * Summary of parsed paper for display
 */
export interface PaperSummary {
  title?: string;
  intervention: string;
  primaryEndpoint: string;
  population: string;
  followUp?: string;
}

/**
 * Pipeline step status for progress display
 */
export type PipelineStep = 'idle' | 'parsing-paper' | 'extracting-patient' | 'checking-applicability' | 'generating-output' | 'complete' | 'error';

export const PIPELINE_STEPS: { step: PipelineStep; label: string }[] = [
  { step: 'parsing-paper', label: 'Parse Paper' },
  { step: 'extracting-patient', label: 'Extract Patient Data' },
  { step: 'checking-applicability', label: 'Check Applicability' },
  { step: 'generating-output', label: 'Generate Personalized Output' },
];
