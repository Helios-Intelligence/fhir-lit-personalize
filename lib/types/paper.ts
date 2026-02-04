import { z } from 'zod';

/**
 * Schema for parsed paper data extracted by LLM
 */
export const ParsedPaperSchema = z.object({
  title: z.string().optional(),
  biomarkers: z.array(z.string()).describe('Biomarkers discussed in the study (e.g., LDL, HbA1c, eGFR)'),
  inclusionCriteria: z.string().describe('Study inclusion criteria as a human-readable string'),
  exclusionCriteria: z.string().nullable().describe('Study exclusion criteria, or null if not specified'),
  populationDemographics: z.object({
    ageRange: z.string().optional().describe('Age range as string (e.g., "40-75 years")'),
    minAge: z.number().optional().describe('Minimum age in years'),
    maxAge: z.number().optional().describe('Maximum age in years'),
    requiredConditions: z.array(z.string()).optional().describe('Conditions required for inclusion'),
    requiredMedications: z.array(z.string()).optional().describe('Medications required for inclusion'),
  }),
  intervention: z.string().describe('The intervention being studied'),
  comparator: z.string().optional().describe('The comparator/control group'),
  primaryEndpoint: z.string().describe('Primary endpoint of the study'),
  secondaryEndpoints: z.array(z.string()).optional().describe('Secondary endpoints if any'),
  keyFindings: z.object({
    effectSizes: z.record(z.string(), z.number()).optional().describe('Effect sizes for different outcomes'),
    relativeRiskReduction: z.number().optional().describe('Relative risk reduction (RRR) as decimal'),
    absoluteRiskReduction: z.number().optional().describe('Absolute risk reduction (ARR) as decimal'),
    hazardRatio: z.number().optional().describe('Hazard ratio'),
    hazardRatioCI: z.object({
      lower: z.number(),
      upper: z.number()
    }).optional().describe('95% confidence interval for hazard ratio'),
    nnt: z.number().optional().describe('Number needed to treat'),
  }),
  followUpDuration: z.string().describe('Follow-up duration (e.g., "2.2 years median")'),
  baselineEventRate: z.number().optional().describe('Baseline event rate in control group as decimal'),
  sampleSize: z.number().optional().describe('Total number of participants'),
  studyDesign: z.string().optional().describe('Study design (e.g., RCT, cohort)'),
});

export type ParsedPaper = z.infer<typeof ParsedPaperSchema>;

/**
 * Paper source types
 */
export type PaperSource = 'pdf' | 'pmid' | 'doi';

/**
 * Response from paper fetch endpoint
 */
export interface FetchedPaper {
  text: string;
  title?: string;
  abstract?: string;
  pmid?: string;
  doi?: string;
  isOpenAccess: boolean;
}
