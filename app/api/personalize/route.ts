import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { checkApplicability } from '@/lib/applicability-checker';
import { loadPromptWithVariables } from '@/lib/prompt-loader';
import { getBiomarkerValue } from '@/lib/fhir-extractor';
import { extractUsage, buildUsageSummary, type LLMCallUsage } from '@/lib/token-tracker';
import type { ParsedPaper } from '@/lib/types/paper';
import type { ExtractedPatient } from '@/lib/types/patient';
import type { PipelineResult, PersonalizedResult, PatientSummary, PaperSummary } from '@/lib/types/result';

export const runtime = 'nodejs';
export const maxDuration = 180;

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

// Interface for serialized patient data (Map becomes array of entries)
interface SerializedPatient {
  age: number | null;
  sex: 'male' | 'female' | 'other' | 'unknown';
  birthDate?: string;
  name?: string;
  observations: Array<[string, any]>; // Serialized Map entries
  conditions: Array<{
    display: string;
    snomedCode?: string;
    icd10Code?: string;
    clinicalStatus: string;
    onsetDate?: string;
  }>;
  medications: Array<{
    name: string;
    status: string;
    dosage?: string;
    startDate?: string;
    rxnormCode?: string;
  }>;
}

interface PersonalizeRequest {
  extractedPatient: SerializedPatient;
  parsedPaper: ParsedPaper;
}

// Deserialize patient data (convert observations array back to Map)
function deserializePatient(serialized: SerializedPatient): ExtractedPatient {
  return {
    ...serialized,
    observations: new Map(serialized.observations),
  };
}

export async function POST(request: NextRequest) {
  try {
    const body: PersonalizeRequest = await request.json();
    const { extractedPatient, parsedPaper } = body;

    // Validate inputs
    if (!extractedPatient) {
      return NextResponse.json(
        { error: 'Extracted patient data is required' },
        { status: 400 }
      );
    }

    if (!parsedPaper) {
      return NextResponse.json(
        { error: 'Parsed paper data is required' },
        { status: 400 }
      );
    }

    // Deserialize patient data (convert observations array back to Map)
    const patient = deserializePatient(extractedPatient);

    // Create patient summary for response
    const patientSummary: PatientSummary = {
      age: patient.age,
      sex: patient.sex,
      relevantBiomarkers: [],
      relevantConditions: patient.conditions.map(c => c.display),
      relevantMedications: patient.medications.map(m => m.name),
    };

    // Add relevant biomarkers based on paper
    for (const biomarker of parsedPaper.biomarkers) {
      const value = getBiomarkerValue(patient, biomarker);
      if (value) {
        patientSummary.relevantBiomarkers.push({
          name: value.display || biomarker,
          value: String(value.value),
          unit: value.unit,
          date: value.date,
        });
      }
    }

    // Create paper summary for response
    const paperSummary: PaperSummary = {
      title: parsedPaper.title ?? undefined,
      intervention: parsedPaper.intervention ?? undefined,
      primaryEndpoint: parsedPaper.primaryEndpoint ?? undefined,
      population: parsedPaper.inclusionCriteria ?? undefined,
      followUp: parsedPaper.followUpDuration ?? undefined,
    };

    // Step 3: Check applicability
    const applicability = await checkApplicability(patient, parsedPaper);
    const usageCalls: LLMCallUsage[] = [];

    // Collect applicability usage if present
    if (applicability.usage) {
      usageCalls.push(applicability.usage);
    }

    if (!applicability.isApplicable) {
      const result: PipelineResult = {
        success: true,
        applicability,
        patientSummary,
        paperSummary,
        tokenUsage: buildUsageSummary(usageCalls),
      };

      return NextResponse.json(result);
    }

    // Step 4: Generate personalized output
    if (!GOOGLE_API_KEY) {
      return NextResponse.json(
        { error: 'GOOGLE_API_KEY is not configured' },
        { status: 500 }
      );
    }

    const { result: personalizedResult, usage: outputUsage } = await generatePersonalizedOutput(patient, parsedPaper, patientSummary);
    usageCalls.push(outputUsage);

    const result: PipelineResult = {
      success: true,
      applicability,
      personalizedResult,
      patientSummary,
      paperSummary,
      tokenUsage: buildUsageSummary(usageCalls),
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error('Personalize error:', error);

    const message = error instanceof Error
      ? error.message
      : 'Failed to personalize findings';

    return NextResponse.json(
      {
        success: false,
        error: message
      },
      { status: 500 }
    );
  }
}

async function generatePersonalizedOutput(
  patient: ExtractedPatient,
  paper: ParsedPaper,
  patientSummary: PatientSummary
): Promise<{ result: PersonalizedResult; usage: LLMCallUsage }> {
  const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY!);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    generationConfig: {
      temperature: 0.3,
      responseMimeType: 'application/json',
    },
  });

  // Format patient data
  const patientDataLines: string[] = [];
  patientDataLines.push(`Age: ${patient.age ?? 'Unknown'}`);
  patientDataLines.push(`Sex: ${patient.sex}`);

  if (patientSummary.relevantBiomarkers.length > 0) {
    patientDataLines.push('\nRelevant Biomarkers:');
    for (const bio of patientSummary.relevantBiomarkers) {
      patientDataLines.push(`- ${bio.name}: ${bio.value}${bio.unit ? ` ${bio.unit}` : ''} (as of ${bio.date.split('T')[0]})`);
    }
  }

  if (patientSummary.relevantConditions.length > 0) {
    patientDataLines.push('\nConditions:');
    patientDataLines.push(patientSummary.relevantConditions.map(c => `- ${c}`).join('\n'));
  }

  if (patientSummary.relevantMedications.length > 0) {
    patientDataLines.push('\nCurrent Medications:');
    patientDataLines.push(patientSummary.relevantMedications.slice(0, 10).map(m => `- ${m}`).join('\n'));
  }

  // Format study findings
  const findingsLines: string[] = [];
  if (paper.title) {
    findingsLines.push(`Study: ${paper.title}`);
  }
  findingsLines.push(`Intervention (with dosing): ${paper.intervention}`);
  findingsLines.push(`Primary Endpoint: ${paper.primaryEndpoint}`);
  findingsLines.push(`Follow-up Duration: ${paper.followUpDuration}`);
  findingsLines.push(`Sample Size: ${paper.sampleSize || 'Not specified'}`);

  // Add biomarker effects (LDL reduction, HbA1c change, etc.)
  if (paper.biomarkerEffects && Object.keys(paper.biomarkerEffects).length > 0) {
    findingsLines.push(`\nBiomarker Effects:`);
    for (const [biomarker, effect] of Object.entries(paper.biomarkerEffects)) {
      if (effect) {
        const parts: string[] = [`- ${biomarker}:`];
        if (effect.percentReduction) {
          parts.push(`${(effect.percentReduction * 100).toFixed(0)}% reduction`);
        }
        if (effect.absoluteChange) {
          const sign = effect.absoluteChange > 0 ? '+' : '';
          parts.push(`${sign}${effect.absoluteChange} ${effect.unit || ''} change`);
        }
        if (effect.baselineValue && effect.achievedValue) {
          parts.push(`(from ${effect.baselineValue} to ${effect.achievedValue} ${effect.unit || ''})`);
        }
        findingsLines.push(parts.join(' '));
      }
    }
  }

  // Pre-compute plain-language absolute risk numbers for the LLM
  // so it doesn't need to work from (or parrot) technical statistics
  findingsLines.push(`\nClinical Outcomes (use these numbers directly - do NOT mention hazard ratios or technical statistics):`);

  if (paper.baselineEventRate && paper.keyFindings.hazardRatio) {
    const baselinePer100 = Math.round(paper.baselineEventRate * 100);
    const treatmentPer100 = Math.round(paper.baselineEventRate * paper.keyFindings.hazardRatio * 100);
    const benefitPer100 = baselinePer100 - treatmentPer100;
    findingsLines.push(`- Without treatment: about ${baselinePer100} out of 100 people experienced the primary outcome over the study period`);
    findingsLines.push(`- With treatment: about ${treatmentPer100} out of 100 people experienced the primary outcome over the study period`);
    findingsLines.push(`- Absolute benefit: about ${benefitPer100} fewer events per 100 people treated`);
  } else if (paper.baselineEventRate && paper.keyFindings.absoluteRiskReduction) {
    const baselinePer100 = Math.round(paper.baselineEventRate * 100);
    const treatmentPer100 = Math.round((paper.baselineEventRate - paper.keyFindings.absoluteRiskReduction) * 100);
    const benefitPer100 = baselinePer100 - treatmentPer100;
    findingsLines.push(`- Without treatment: about ${baselinePer100} out of 100 people experienced the primary outcome over the study period`);
    findingsLines.push(`- With treatment: about ${treatmentPer100} out of 100 people experienced the primary outcome over the study period`);
    findingsLines.push(`- Absolute benefit: about ${benefitPer100} fewer events per 100 people treated`);
  } else if (paper.keyFindings.absoluteRiskReduction) {
    const arrPer100 = Math.round(paper.keyFindings.absoluteRiskReduction * 100);
    findingsLines.push(`- Absolute benefit: about ${arrPer100} fewer events per 100 people treated`);
  } else if (paper.keyFindings.hazardRatio) {
    // No baseline rate available - provide qualitative direction only
    const direction = paper.keyFindings.hazardRatio < 1 ? 'reduced' : 'increased';
    findingsLines.push(`- The treatment was associated with ${direction} risk of the primary outcome (describe qualitatively, do NOT cite specific numbers you cannot verify)`);
  } else if (paper.keyFindings.relativeRiskReduction) {
    // Only relative risk available - provide qualitative direction
    findingsLines.push(`- The treatment was associated with reduced risk of the primary outcome (describe qualitatively, do NOT cite specific numbers you cannot verify)`);
  }

  const prompt = loadPromptWithVariables('personalize/generate_output', {
    PATIENT_DATA: patientDataLines.join('\n'),
    STUDY_FINDINGS: findingsLines.join('\n'),
  });

  const genResult = await model.generateContent(prompt);
  const usage = extractUsage(genResult.response, 'Generate Output');
  const responseText = genResult.response.text().trim();

  // Parse JSON response
  const cleaned = responseText
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();

  const parsed = JSON.parse(cleaned);

  return {
    result: {
      studySummary: parsed.studySummary || 'Unable to generate summary',
      patientProjection: parsed.patientProjection || 'Unable to generate projection',
      contextualizedRisk: parsed.contextualizedRisk || 'Unable to generate risk context',
      suggestedAction: parsed.suggestedAction || 'Discuss these findings with your healthcare provider.',
    },
    usage,
  };
}
