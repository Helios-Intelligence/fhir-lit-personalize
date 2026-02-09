/**
 * Client-side FHIR data extraction
 * Extracts patient data from FHIR bundle and serializes for API transmission
 */

// SNOMED codes used for clinical status in some FHIR bundles
const CLINICAL_STATUS_SNOMED: Record<string, string> = {
  '55561003': 'active',
  '73425007': 'inactive',
  '413322009': 'resolved',
  '24484000': 'recurrence',
  '723506003': 'relapse',
  '277022003': 'remission',
};

function normalizeClinicalStatus(clinicalStatus: any): string {
  if (!clinicalStatus) return 'unknown';
  const code = clinicalStatus.coding?.[0]?.code;
  if (code) {
    const lower = code.toLowerCase();
    if (['active', 'resolved', 'recurrence', 'inactive', 'remission', 'relapse'].includes(lower)) {
      return lower;
    }
    if (CLINICAL_STATUS_SNOMED[code]) {
      return CLINICAL_STATUS_SNOMED[code];
    }
  }
  const display = (clinicalStatus.coding?.[0]?.display || clinicalStatus.text || '').toLowerCase().trim();
  if (['active', 'resolved', 'recurrence', 'inactive', 'remission', 'relapse'].includes(display)) {
    return display;
  }
  return 'unknown';
}

interface ObservationValue {
  value: number | string;
  unit?: string;
  date: string;
  loincCode?: string;
  display?: string;
  interpretation?: string;
}

interface PatientCondition {
  display: string;
  snomedCode?: string;
  icd10Code?: string;
  clinicalStatus: string;
  onsetDate?: string;
}

interface PatientMedication {
  name: string;
  status: string;
  dosage?: string;
  startDate?: string;
  rxnormCode?: string;
}

// Serialized format for API transmission (Map converted to array)
interface SerializedPatient {
  age: number | null;
  sex: 'male' | 'female' | 'other' | 'unknown';
  birthDate?: string;
  name?: string;
  observations: Array<[string, ObservationValue]>;
  conditions: PatientCondition[];
  medications: PatientMedication[];
}

/**
 * Extract patient data from FHIR bundle (client-side)
 * Returns serialized format suitable for JSON transmission
 */
export function extractPatientDataClient(bundle: any): SerializedPatient {
  const observations: any[] = [];
  const conditions: any[] = [];
  const medicationStatements: any[] = [];
  const medicationRequests: any[] = [];
  const medicationResources: any[] = [];
  let patientResource: any = null;

  // Collect all resources from the bundle
  if (bundle.entry) {
    for (const entry of bundle.entry) {
      if (!entry.resource) continue;

      switch (entry.resource.resourceType) {
        case 'Patient':
          patientResource = entry.resource;
          break;
        case 'Observation':
          observations.push(entry.resource);
          break;
        case 'Condition':
          conditions.push(entry.resource);
          break;
        case 'MedicationStatement':
          medicationStatements.push(entry.resource);
          break;
        case 'MedicationRequest':
          medicationRequests.push(entry.resource);
          break;
        case 'Medication':
          medicationResources.push(entry.resource);
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
      const patientBirthDate = patientResource.birthDate as string;
      birthDate = patientBirthDate;
      const birth = new Date(patientBirthDate);
      const today = new Date();
      age = today.getFullYear() - birth.getFullYear();
      const monthDiff = today.getMonth() - birth.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
        age--;
      }
    }

    // Extract sex
    if (patientResource.gender) {
      sex = patientResource.gender;
    }
  }

  // Create medication lookup map
  const medicationMap = new Map<string, any>();
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

  // Extract conditions with all available codes
  const extractedConditions: PatientCondition[] = conditions
    .filter(cond => {
      const status = normalizeClinicalStatus(cond.clinicalStatus);
      return status === 'active' || status === 'resolved' || status === 'recurrence';
    })
    .map(cond => {
      const codings = cond.code?.coding || [];
      return {
        display: cond.code?.text || cond.code?.coding?.[0]?.display || 'Unknown condition',
        snomedCode: codings.find((c: any) => c.system?.includes('snomed'))?.code,
        icd10Code: codings.find((c: any) => c.system?.includes('icd-10') || c.system?.includes('icd10'))?.code,
        clinicalStatus: normalizeClinicalStatus(cond.clinicalStatus),
        onsetDate: cond.onsetDateTime || cond.onsetPeriod?.start,
      };
    });

  // Extract medications
  const extractedMedications: PatientMedication[] = [];

  // From MedicationStatement
  for (const stmt of medicationStatements) {
    const status = stmt.status || 'unknown';
    if (status !== 'active' && status !== 'intended' && status !== 'on-hold') continue;

    const { name: medicationName, rxnormCode } = getMedicationInfo(stmt.medicationCodeableConcept, stmt.medicationReference, medicationMap);
    const dosageInfo = stmt.dosage?.[0];
    const doseQuantity = dosageInfo?.doseAndRate?.[0]?.doseQuantity;
    const dosage = dosageInfo?.text || (doseQuantity ? `${doseQuantity.value} ${doseQuantity.unit || ''}`.trim() : undefined);

    extractedMedications.push({
      name: medicationName,
      status,
      dosage,
      startDate: stmt.effectivePeriod?.start || stmt.effectiveDateTime,
      rxnormCode,
    });
  }

  // From MedicationRequest
  for (const req of medicationRequests) {
    const status = req.status || 'unknown';
    if (status !== 'active' && status !== 'on-hold') continue;

    const { name: medicationName, rxnormCode } = getMedicationInfo(req.medicationCodeableConcept, req.medicationReference, medicationMap);
    const dosageInfo = req.dosageInstruction?.[0];
    const doseQuantity = dosageInfo?.doseAndRate?.[0]?.doseQuantity;
    const dosage = dosageInfo?.text || (doseQuantity ? `${doseQuantity.value} ${doseQuantity.unit || ''}`.trim() : undefined);

    extractedMedications.push({
      name: medicationName,
      status,
      dosage,
      startDate: req.authoredOn,
      rxnormCode,
    });
  }

  // Return serialized format (Map converted to array for JSON)
  return {
    age,
    sex,
    birthDate,
    name,
    observations: Array.from(observationMap.entries()),
    conditions: extractedConditions,
    medications: extractedMedications,
  };
}

function formatObservationValue(obs: any): string {
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

function getMedicationInfo(
  medicationCodeableConcept: any,
  medicationReference: any,
  medicationMap: Map<string, any>
): { name: string; rxnormCode?: string } {
  let name = 'Unknown medication';
  let rxnormCode: string | undefined;

  // Try medicationCodeableConcept first
  if (medicationCodeableConcept) {
    const codings = medicationCodeableConcept.coding || [];
    name = medicationCodeableConcept.text || codings[0]?.display || name;
    rxnormCode = codings.find((c: any) => c.system?.includes('rxnorm'))?.code;
  }

  // Try to resolve medicationReference
  if (medicationReference?.reference) {
    const refId = medicationReference.reference;
    const medication = medicationMap.get(refId);

    if (medication) {
      const codings = medication.code?.coding || [];
      name = medication.code?.text || codings[0]?.display || name;
      if (!rxnormCode) {
        rxnormCode = codings.find((c: any) => c.system?.includes('rxnorm'))?.code;
      }
    }
  }

  return { name, rxnormCode };
}
