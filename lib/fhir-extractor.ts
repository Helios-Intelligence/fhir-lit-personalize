import type {
  IBundle,
  IObservation,
  ICondition,
  IMedicationStatement,
  IMedicationRequest,
  IMedication,
  IPatient
} from '@ahryman40k/ts-fhir-types/lib/R4';
import type { ExtractedPatient, ObservationValue, PatientCondition, PatientMedication } from './types/patient';
import { LOINC_CODES, SNOMED_CODES, BIOMARKER_LOINC_MAP } from './types/patient';

/**
 * Extract patient data from FHIR bundle for literature personalization
 * Simplified version focused on biomarker-relevant data
 */
export function extractPatientData(bundle: IBundle): ExtractedPatient {
  const observations: IObservation[] = [];
  const conditions: ICondition[] = [];
  const medicationStatements: IMedicationStatement[] = [];
  const medicationRequests: IMedicationRequest[] = [];
  const medicationResources: IMedication[] = [];
  let patientResource: IPatient | null = null;

  // Collect all resources from the bundle
  if (bundle.entry) {
    for (const entry of bundle.entry) {
      if (!entry.resource) continue;

      switch (entry.resource.resourceType) {
        case 'Patient':
          patientResource = entry.resource as IPatient;
          break;
        case 'Observation':
          observations.push(entry.resource as IObservation);
          break;
        case 'Condition':
          conditions.push(entry.resource as ICondition);
          break;
        case 'MedicationStatement':
          medicationStatements.push(entry.resource as IMedicationStatement);
          break;
        case 'MedicationRequest':
          medicationRequests.push(entry.resource as IMedicationRequest);
          break;
        case 'Medication':
          medicationResources.push(entry.resource as IMedication);
          break;
      }
    }
  }

  // Extract patient demographics
  let age: number | null = null;
  let sex: 'male' | 'female' | 'other' | 'unknown' = 'unknown';
  let birthDate: string | undefined;
  let name: string | undefined;

  if (patientResource) {
    // Extract name
    if (patientResource.name && patientResource.name.length > 0) {
      const patientName = patientResource.name[0];
      const nameParts: string[] = [];
      if (patientName.given) nameParts.push(...patientName.given);
      if (patientName.family) nameParts.push(patientName.family);
      if (nameParts.length > 0) {
        name = nameParts.join(' ');
      }
    }

    // Extract birth date and calculate age
    if (patientResource.birthDate) {
      birthDate = patientResource.birthDate;
      const birth = new Date(birthDate);
      const today = new Date();
      age = today.getFullYear() - birth.getFullYear();
      const monthDiff = today.getMonth() - birth.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
        age--;
      }
    }

    // Extract sex
    if (patientResource.gender) {
      sex = patientResource.gender as typeof sex;
    }
  }

  // Create medication lookup map
  const medicationMap = new Map<string, IMedication>();
  medicationResources.forEach(med => {
    if (med.id) {
      medicationMap.set(med.id, med);
      medicationMap.set(`Medication/${med.id}`, med);
    }
  });

  // Extract observations (most recent for each LOINC code)
  const observationMap = new Map<string, ObservationValue>();

  // Sort observations by date (most recent first)
  const sortedObs = observations
    .filter(obs => obs.effectiveDateTime && obs.code?.coding?.[0]?.code)
    .sort((a, b) => {
      const dateA = new Date(a.effectiveDateTime!).getTime();
      const dateB = new Date(b.effectiveDateTime!).getTime();
      return dateB - dateA;
    });

  // Keep only most recent for each LOINC code
  for (const obs of sortedObs) {
    const loincCode = obs.code?.coding?.[0]?.code;
    if (!loincCode || observationMap.has(loincCode)) continue;

    const value = formatObservationValue(obs);
    if (value === 'N/A') continue;

    observationMap.set(loincCode, {
      value: obs.valueQuantity?.value ?? value,
      unit: obs.valueQuantity?.unit,
      date: obs.effectiveDateTime!,
      loincCode,
      display: obs.code?.text || obs.code?.coding?.[0]?.display,
      interpretation: obs.interpretation?.[0]?.coding?.[0]?.display,
    });
  }

  // Extract conditions
  const extractedConditions: PatientCondition[] = conditions
    .filter(cond => {
      // Include active conditions or resolved conditions that may be relevant history
      const clinicalStatus = cond.clinicalStatus?.coding?.[0]?.code;
      return clinicalStatus === 'active' || clinicalStatus === 'resolved' || clinicalStatus === 'recurrence';
    })
    .map(cond => ({
      display: cond.code?.text || cond.code?.coding?.[0]?.display || 'Unknown condition',
      snomedCode: cond.code?.coding?.find(c => c.system?.includes('snomed'))?.code,
      clinicalStatus: cond.clinicalStatus?.coding?.[0]?.code || 'unknown',
      onsetDate: cond.onsetDateTime || cond.onsetPeriod?.start,
    }));

  // Extract medications
  const extractedMedications: PatientMedication[] = [];

  // From MedicationStatement
  for (const stmt of medicationStatements) {
    const status = stmt.status || 'unknown';
    if (status !== 'active' && status !== 'intended' && status !== 'on-hold') continue;

    const medicationName = getMedicationName(stmt.medicationCodeableConcept, stmt.medicationReference, medicationMap);
    const dosageInfo = stmt.dosage?.[0];
    const doseQuantity = dosageInfo?.doseAndRate?.[0]?.doseQuantity;
    const dosage = dosageInfo?.text || (doseQuantity ? `${doseQuantity.value} ${doseQuantity.unit || ''}`.trim() : undefined);

    extractedMedications.push({
      name: medicationName,
      status,
      dosage,
      startDate: stmt.effectivePeriod?.start || stmt.effectiveDateTime,
    });
  }

  // From MedicationRequest
  for (const req of medicationRequests) {
    const status = req.status || 'unknown';
    if (status !== 'active' && status !== 'on-hold') continue;

    const medicationName = getMedicationName(req.medicationCodeableConcept, req.medicationReference, medicationMap);
    const dosageInfo = req.dosageInstruction?.[0];
    const doseQuantity = dosageInfo?.doseAndRate?.[0]?.doseQuantity;
    const dosage = dosageInfo?.text || (doseQuantity ? `${doseQuantity.value} ${doseQuantity.unit || ''}`.trim() : undefined);

    extractedMedications.push({
      name: medicationName,
      status,
      dosage,
      startDate: req.authoredOn,
    });
  }

  return {
    age,
    sex,
    birthDate,
    name,
    observations: observationMap,
    conditions: extractedConditions,
    medications: extractedMedications,
  };
}

/**
 * Get observation value for a specific biomarker by name
 */
export function getBiomarkerValue(patient: ExtractedPatient, biomarkerName: string): ObservationValue | undefined {
  const normalizedName = biomarkerName.toLowerCase().trim();

  // Check direct LOINC codes
  const loincCodes = BIOMARKER_LOINC_MAP[normalizedName];
  if (loincCodes) {
    for (const code of loincCodes) {
      const value = patient.observations.get(code);
      if (value) return value;
    }
  }

  // Fallback: search by display name
  for (const [, obs] of patient.observations) {
    if (obs.display?.toLowerCase().includes(normalizedName)) {
      return obs;
    }
  }

  return undefined;
}

/**
 * Check if patient has a specific condition by SNOMED code or name
 */
export function hasCondition(patient: ExtractedPatient, conditionIdentifier: string): boolean {
  const normalized = conditionIdentifier.toLowerCase().trim();

  return patient.conditions.some(cond => {
    // Check SNOMED code match
    if (cond.snomedCode === conditionIdentifier) return true;

    // Check display name match
    if (cond.display.toLowerCase().includes(normalized)) return true;

    return false;
  });
}

/**
 * Check if patient is on a specific medication
 */
export function hasMedication(patient: ExtractedPatient, medicationName: string): boolean {
  const normalized = medicationName.toLowerCase().trim();

  return patient.medications.some(med =>
    med.name.toLowerCase().includes(normalized) &&
    (med.status === 'active' || med.status === 'intended' || med.status === 'on-hold')
  );
}

// Helper functions

function formatObservationValue(obs: IObservation): string {
  if (obs.valueQuantity) {
    return `${obs.valueQuantity.value}`;
  } else if (obs.valueString) {
    return obs.valueString;
  } else if (obs.valueCodeableConcept) {
    return obs.valueCodeableConcept.text ||
           obs.valueCodeableConcept.coding?.[0]?.display ||
           'See report';
  } else if (obs.valueBoolean !== undefined) {
    return obs.valueBoolean.toString();
  } else if (obs.valueInteger !== undefined) {
    return obs.valueInteger.toString();
  }
  return 'N/A';
}

function getMedicationName(
  medicationCodeableConcept: any,
  medicationReference: any,
  medicationMap: Map<string, IMedication>
): string {
  // First try medicationCodeableConcept
  if (medicationCodeableConcept?.text) {
    return medicationCodeableConcept.text;
  }
  if (medicationCodeableConcept?.coding?.[0]?.display) {
    return medicationCodeableConcept.coding[0].display;
  }

  // Try to resolve medicationReference
  if (medicationReference?.reference) {
    const refId = medicationReference.reference;
    const medication = medicationMap.get(refId);

    if (medication) {
      if (medication.code?.text) {
        return medication.code.text;
      }
      if (medication.code?.coding?.[0]?.display) {
        return medication.code.coding[0].display;
      }
    }
  }

  return 'Unknown medication';
}
