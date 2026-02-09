import { GoogleGenerativeAI } from '@google/generative-ai';
import { loadPromptWithVariables } from './prompt-loader';
import type { ExtractedPatient } from './types/patient';
import type { ParsedPaper } from './types/paper';
import type { ApplicabilityResult, ApplicabilityReason } from './types/result';
import { getBiomarkerValue, hasCondition, hasMedication } from './fhir-extractor';
import { extractUsage, type LLMCallUsage } from './token-tracker';

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

/**
 * Check if a patient meets the study criteria using both rule-based and LLM logic
 */
export async function checkApplicability(
  patient: ExtractedPatient,
  paper: ParsedPaper
): Promise<ApplicabilityResult> {
  const reasons: ApplicabilityReason[] = [];

  // Rule-based checks first (fast)
  const ruleBasedResult = performRuleBasedChecks(patient, paper);
  if (!ruleBasedResult.isApplicable) {
    return ruleBasedResult;
  }

  // If rule-based checks pass but we need more nuanced analysis, use LLM
  const llmResult = await performLLMCheck(patient, paper);

  return llmResult;
}

/**
 * Perform fast rule-based applicability checks
 */
function performRuleBasedChecks(
  patient: ExtractedPatient,
  paper: ParsedPaper
): ApplicabilityResult {
  const reasons: ApplicabilityReason[] = [];

  // Check age range
  if (patient.age !== null && paper.populationDemographics) {
    const { minAge, maxAge } = paper.populationDemographics;

    if (minAge && patient.age < minAge) {
      reasons.push({
        type: 'age',
        description: `Patient age (${patient.age}) is below the study minimum age (${minAge})`,
        details: `The study enrolled patients ${minAge}+ years old`,
      });
    }

    if (maxAge && patient.age > maxAge) {
      reasons.push({
        type: 'age',
        description: `Patient age (${patient.age}) exceeds the study maximum age (${maxAge})`,
        details: `The study enrolled patients up to ${maxAge} years old`,
      });
    }
  }

  // Check required conditions
  if (paper.populationDemographics?.requiredConditions && paper.populationDemographics.requiredConditions.length > 0) {
    const requiredConditions = paper.populationDemographics.requiredConditions;
    const conditionLogic = paper.populationDemographics.requiredConditionLogic || 'AND';

    if (conditionLogic === 'OR') {
      // Patient needs ANY ONE of the conditions
      const hasAnyCondition = requiredConditions.some(cond => hasCondition(patient, cond));
      if (!hasAnyCondition) {
        reasons.push({
          type: 'condition',
          description: `Patient does not have any of the required conditions`,
          details: `The study required patients to have at least one of: ${requiredConditions.join(', ')}`,
        });
      }
    } else {
      // Patient needs ALL conditions (AND logic - default)
      for (const requiredCondition of requiredConditions) {
        if (!hasCondition(patient, requiredCondition)) {
          reasons.push({
            type: 'condition',
            description: `Patient does not have required condition: ${requiredCondition}`,
            details: `The study required patients to have ${requiredCondition}`,
          });
        }
      }
    }
  }

  // Check required medications
  if (paper.populationDemographics?.requiredMedications) {
    for (const requiredMed of paper.populationDemographics.requiredMedications) {
      if (!hasMedication(patient, requiredMed)) {
        reasons.push({
          type: 'medication',
          description: `Patient is not on required medication: ${requiredMed}`,
          details: `The study required patients to be taking ${requiredMed}`,
        });
      }
    }
  }

  // Check excluded conditions (patient should NOT have these)
  if (paper.populationDemographics?.excludedConditions) {
    for (const excludedCondition of paper.populationDemographics.excludedConditions) {
      if (hasCondition(patient, excludedCondition)) {
        reasons.push({
          type: 'exclusion',
          description: `Patient has excluded condition: ${excludedCondition}`,
          details: `The study excluded patients who already have ${excludedCondition}`,
        });
      }
    }
  }

  // Check if at least ONE key biomarker is available
  // We only require the primary biomarker (first in list) OR any of the first 3
  const biomarkersToCheck = paper.biomarkers.slice(0, 3);
  if (biomarkersToCheck.length > 0) {
    const availableBiomarkers = biomarkersToCheck.filter(b => getBiomarkerValue(patient, b));

    if (availableBiomarkers.length === 0) {
      // No biomarkers available - this is a problem
      reasons.push({
        type: 'biomarker',
        description: `Missing biomarker data: ${biomarkersToCheck[0]}`,
        details: `The study results are based on ${biomarkersToCheck[0]} levels, which are not in the patient's records. Consider getting this lab test.`,
      });
    }
    // Note: If at least one biomarker is available, we proceed (the LLM can work with what's available)
  }

  return {
    isApplicable: reasons.length === 0,
    reasons,
  };
}

/**
 * Use LLM for nuanced applicability checking
 */
async function performLLMCheck(
  patient: ExtractedPatient,
  paper: ParsedPaper
): Promise<ApplicabilityResult> {
  if (!GOOGLE_API_KEY) {
    // If no API key, return rule-based result as applicable
    return { isApplicable: true, reasons: [] };
  }

  const genAI = new GoogleGenerativeAI(GOOGLE_API_KEY);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
    },
  });

  // Format patient data for prompt
  const patientData = formatPatientDataForPrompt(patient);
  const studyCriteria = formatStudyCriteriaForPrompt(paper);

  const prompt = loadPromptWithVariables('applicability/check_criteria', {
    PATIENT_DATA: patientData,
    STUDY_CRITERIA: studyCriteria,
  });

  try {
    const result = await model.generateContent(prompt);
    const usage = extractUsage(result.response, 'Check Applicability');
    const responseText = result.response.text().trim();

    // Parse JSON response
    const cleaned = responseText
      .replace(/```json\n?/g, '')
      .replace(/```\n?/g, '')
      .trim();

    const parsed = JSON.parse(cleaned);

    return {
      isApplicable: parsed.isApplicable ?? true,
      reasons: (parsed.reasons || []).map((r: any) => ({
        type: r.type || 'condition',
        description: r.description || '',
        details: r.details,
      })),
      usage,
    };
  } catch (error) {
    console.error('LLM applicability check failed:', error);
    // On LLM failure, return applicable (optimistic)
    return { isApplicable: true, reasons: [] };
  }
}

/**
 * Format patient data for LLM prompt
 */
function formatPatientDataForPrompt(patient: ExtractedPatient): string {
  const lines: string[] = [];

  lines.push(`Age: ${patient.age ?? 'Unknown'}`);
  lines.push(`Sex: ${patient.sex}`);

  if (patient.conditions.length > 0) {
    lines.push('\nConditions:');
    for (const cond of patient.conditions) {
      lines.push(`- ${cond.display} (status: ${cond.clinicalStatus})`);
    }
  }

  if (patient.medications.length > 0) {
    lines.push('\nMedications:');
    for (const med of patient.medications) {
      lines.push(`- ${med.name}${med.dosage ? ` (${med.dosage})` : ''}`);
    }
  }

  if (patient.observations.size > 0) {
    lines.push('\nRecent Lab Values:');
    for (const [code, obs] of patient.observations) {
      lines.push(`- ${obs.display || code}: ${obs.value}${obs.unit ? ` ${obs.unit}` : ''}`);
    }
  }

  return lines.join('\n');
}

/**
 * Format study criteria for LLM prompt
 */
function formatStudyCriteriaForPrompt(paper: ParsedPaper): string {
  const lines: string[] = [];

  lines.push(`Inclusion Criteria: ${paper.inclusionCriteria}`);

  if (paper.exclusionCriteria) {
    lines.push(`Exclusion Criteria: ${paper.exclusionCriteria}`);
  }

  if (paper.populationDemographics) {
    const demo = paper.populationDemographics;
    if (demo.ageRange) {
      lines.push(`Age Range: ${demo.ageRange}`);
    }
    if (demo.requiredConditions?.length) {
      lines.push(`Required Conditions: ${demo.requiredConditions.join(', ')}`);
    }
    if (demo.requiredMedications?.length) {
      lines.push(`Required Medications: ${demo.requiredMedications.join(', ')}`);
    }
  }

  lines.push(`Biomarkers Studied: ${paper.biomarkers.join(', ')}`);

  return lines.join('\n');
}
