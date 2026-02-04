import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { IBundle } from '@ahryman40k/ts-fhir-types/lib/R4';
import { extractPatientData, getBiomarkerValue } from '@/lib/fhir-extractor';
import { checkApplicability } from '@/lib/applicability-checker';
import { loadPromptWithVariables } from '@/lib/prompt-loader';
import type { ParsedPaper } from '@/lib/types/paper';
import type { PipelineResult, PersonalizedResult, PatientSummary, PaperSummary } from '@/lib/types/result';

export const runtime = 'nodejs';
export const maxDuration = 180;

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

interface PersonalizeRequest {
  fhirBundle: IBundle;
  parsedPaper: ParsedPaper;
}

export async function POST(request: NextRequest) {
  try {
    const body: PersonalizeRequest = await request.json();
    const { fhirBundle, parsedPaper } = body;

    // Validate inputs
    if (!fhirBundle || !fhirBundle.entry) {
      return NextResponse.json(
        { error: 'Invalid FHIR Bundle format' },
        { status: 400 }
      );
    }

    if (!parsedPaper) {
      return NextResponse.json(
        { error: 'Parsed paper data is required' },
        { status: 400 }
      );
    }

    // Step 2: Extract patient data from FHIR bundle
    const patient = extractPatientData(fhirBundle);

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

    if (!applicability.isApplicable) {
      const result: PipelineResult = {
        success: true,
        applicability,
        patientSummary,
        paperSummary,
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

    const personalizedResult = await generatePersonalizedOutput(patient, parsedPaper, patientSummary);

    const result: PipelineResult = {
      success: true,
      applicability,
      personalizedResult,
      patientSummary,
      paperSummary,
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
  patient: ReturnType<typeof extractPatientData>,
  paper: ParsedPaper,
  patientSummary: PatientSummary
): Promise<PersonalizedResult> {
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
  findingsLines.push(`Intervention: ${paper.intervention}`);
  findingsLines.push(`Primary Endpoint: ${paper.primaryEndpoint}`);
  findingsLines.push(`Follow-up Duration: ${paper.followUpDuration}`);
  findingsLines.push(`Sample Size: ${paper.sampleSize || 'Not specified'}`);

  if (paper.keyFindings.hazardRatio) {
    findingsLines.push(`\nKey Findings:`);
    findingsLines.push(`- Hazard Ratio: ${paper.keyFindings.hazardRatio}`);
    if (paper.keyFindings.hazardRatioCI) {
      findingsLines.push(`- 95% CI: ${paper.keyFindings.hazardRatioCI.lower} - ${paper.keyFindings.hazardRatioCI.upper}`);
    }
  }

  if (paper.keyFindings.relativeRiskReduction) {
    findingsLines.push(`- Relative Risk Reduction: ${(paper.keyFindings.relativeRiskReduction * 100).toFixed(0)}%`);
  }

  if (paper.keyFindings.absoluteRiskReduction) {
    findingsLines.push(`- Absolute Risk Reduction: ${(paper.keyFindings.absoluteRiskReduction * 100).toFixed(1)}%`);
  }

  if (paper.keyFindings.nnt) {
    findingsLines.push(`- Number Needed to Treat: ${paper.keyFindings.nnt}`);
  }

  if (paper.baselineEventRate) {
    findingsLines.push(`- Baseline Event Rate: ${(paper.baselineEventRate * 100).toFixed(1)}%`);
  }

  const prompt = loadPromptWithVariables('personalize/generate_output', {
    PATIENT_DATA: patientDataLines.join('\n'),
    STUDY_FINDINGS: findingsLines.join('\n'),
  });

  const result = await model.generateContent(prompt);
  const responseText = result.response.text().trim();

  // Parse JSON response
  const cleaned = responseText
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();

  const parsed = JSON.parse(cleaned);

  return {
    studySummary: parsed.studySummary || 'Unable to generate summary',
    patientProjection: parsed.patientProjection || 'Unable to generate projection',
    contextualizedRisk: parsed.contextualizedRisk || 'Unable to generate risk context',
  };
}
