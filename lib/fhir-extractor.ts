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

// SNOMED codes used for clinical status in some FHIR bundles
const CLINICAL_STATUS_SNOMED: Record<string, string> = {
  '55561003': 'active',
  '73425007': 'inactive',
  '413322009': 'resolved',
  '24484000': 'recurrence',
  '723506003': 'relapse',
  '277022003': 'remission',
};

/**
 * Normalize clinical status from various FHIR representations.
 * Some bundles use standard strings ('active'), others use SNOMED codes ('55561003'),
 * and some put it in the text or display fields.
 */
function normalizeClinicalStatus(clinicalStatus: any): string {
  if (!clinicalStatus) return 'unknown';

  // Check coding[0].code — could be standard string or SNOMED code
  const code = clinicalStatus.coding?.[0]?.code;
  if (code) {
    const lower = code.toLowerCase();
    if (['active', 'resolved', 'recurrence', 'inactive', 'remission', 'relapse'].includes(lower)) {
      return lower;
    }
    // Map SNOMED status codes
    if (CLINICAL_STATUS_SNOMED[code]) {
      return CLINICAL_STATUS_SNOMED[code];
    }
  }

  // Fall back to display or text
  const display = (clinicalStatus.coding?.[0]?.display || clinicalStatus.text || '').toLowerCase().trim();
  if (['active', 'resolved', 'recurrence', 'inactive', 'remission', 'relapse'].includes(display)) {
    return display;
  }

  return 'unknown';
}

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

  // Extract conditions with all available codes
  const extractedConditions: PatientCondition[] = conditions
    .filter(cond => {
      // Resolve clinical status from code, display, or text (some FHIR bundles use SNOMED codes instead of standard strings)
      const status = normalizeClinicalStatus(cond.clinicalStatus);
      return status === 'active' || status === 'resolved' || status === 'recurrence';
    })
    .map(cond => {
      const codings = cond.code?.coding || [];
      return {
        display: cond.code?.text || cond.code?.coding?.[0]?.display || 'Unknown condition',
        snomedCode: codings.find(c => c.system?.includes('snomed'))?.code,
        icd10Code: codings.find(c => c.system?.includes('icd-10') || c.system?.includes('icd10'))?.code,
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
 * SNOMED CT and ICD-10 codes for condition classes
 * These are authoritative clinical codes for matching
 */
const CONDITION_CODES: Record<string, { snomed: string[], icd10: string[], terms: string[] }> = {
  // Specific conditions from normalized prompt terms
  'prior myocardial infarction': {
    snomed: ['22298006', '399211009', '401314000', '57054005'],
    icd10: ['I21', 'I22', 'I25.2', 'Z86.79'],
    terms: ['myocardial infarction', 'heart attack', 'mi', 'stemi', 'nstemi', 'prior mi', 'history of mi', 'acute mi'],
  },
  'prior stroke': {
    snomed: ['230690007', '266257000', '399261000', '422504002'],
    icd10: ['I63', 'I64', 'Z86.73'],
    terms: ['stroke', 'cva', 'cerebrovascular accident', 'tia', 'transient ischemic attack', 'prior stroke', 'history of stroke'],
  },
  'peripheral artery disease': {
    snomed: ['400047006', '64156001', '233970002'],
    icd10: ['I70.2', 'I73', 'I73.9'],
    terms: ['peripheral artery disease', 'pad', 'peripheral vascular disease', 'pvd', 'claudication'],
  },
  'type 2 diabetes': {
    snomed: ['44054006'],
    icd10: ['E11'],
    terms: ['type 2 diabetes', 't2dm', 'diabetes mellitus type 2', 'type ii diabetes', 'dm2'],
  },
  'chronic kidney disease': {
    snomed: ['709044004', '431855005', '431856006', '431857002', '433146000'],
    icd10: ['N18', 'N18.1', 'N18.2', 'N18.3', 'N18.4', 'N18.5', 'N18.6', 'N18.9'],
    terms: ['chronic kidney disease', 'ckd', 'renal insufficiency', 'kidney failure'],
  },
  'hyperlipidemia': {
    snomed: ['55822004', '398036000', '13644009'],
    icd10: ['E78', 'E78.0', 'E78.1', 'E78.2', 'E78.4', 'E78.5'],
    terms: ['hyperlipidemia', 'dyslipidemia', 'high cholesterol', 'hypercholesterolemia', 'hypertriglyceridemia'],
  },
  'atherosclerotic cardiovascular disease': {
    snomed: [
      '53741008',   // Coronary artery disease
      '443502000',  // Coronary atherosclerosis (Atherosclerosis of coronary artery)
      '285151000119108', // CAD of autologous bypass graft
      '429673002',  // CAD involving coronary bypass graft
      '414545008',  // Ischemic heart disease
      '22298006',   // Myocardial infarction
      '57054005',   // Acute myocardial infarction
      '230690007',  // Stroke / CVA
      '266257000',  // TIA
      '399211009',  // History of MI
      '399261000',  // History of CVA
      '400047006',  // Peripheral vascular disease
      '64156001',   // Thrombophlebitis
      '233970002',  // Coronary artery bypass graft
      '428752002',  // History of CABG
      '429559004',  // History of PCI
      '413838009',  // Chronic ischemic heart disease
      '194828000',  // Angina
      '25106000',   // Acute coronary syndrome
    ],
    icd10: [
      'I25', 'I25.1', 'I25.10', 'I25.11', 'I25.110', 'I25.111', 'I25.118', 'I25.119', // Chronic ischemic heart disease
      'I21', 'I21.0', 'I21.1', 'I21.2', 'I21.3', 'I21.4', 'I21.9', // Acute MI
      'I22', // Subsequent MI
      'I63', 'I63.0', 'I63.1', 'I63.2', 'I63.3', 'I63.4', 'I63.5', 'I63.9', // Cerebral infarction
      'I65', 'I66', // Carotid/cerebral artery occlusion
      'I70', 'I70.2', 'I70.20', 'I70.21', 'I70.22', 'I70.23', 'I70.24', 'I70.25', // Atherosclerosis
      'I73', 'I73.9', // Peripheral vascular disease
      'Z95.1', // Presence of CABG
      'Z95.5', // Presence of coronary stent
      'Z86.73', // History of TIA
      'Z86.74', // History of sudden cardiac arrest
    ],
    terms: [
      'coronary artery disease', 'cad', 'coronary heart disease', 'chd',
      'coronary atherosclerosis', 'atherosclerotic heart disease', 'atherosclerotic cardiovascular',
      'myocardial infarction', 'mi', 'heart attack',
      'stroke', 'cerebrovascular accident', 'cva', 'tia', 'transient ischemic attack',
      'peripheral artery disease', 'pad', 'peripheral vascular disease', 'pvd',
      'carotid stenosis', 'carotid artery disease',
      'ascvd', 'ischemic heart disease', 'angina', 'acute coronary syndrome',
      'stemi', 'nstemi', 'unstable angina', 'cabg', 'bypass', 'stent', 'pci',
      'coronary artery bypass', 'angioplasty', 'ptca',
    ],
  },
  'cardiovascular disease': {
    snomed: [
      '53741008',   // CAD
      '84114007',   // Heart failure
      '49436004',   // Atrial fibrillation
      '22298006',   // MI
      '230690007',  // Stroke
    ],
    icd10: ['I25', 'I50', 'I48', 'I21', 'I63'],
    terms: ['coronary artery disease', 'heart disease', 'heart failure', 'atrial fibrillation', 'myocardial infarction', 'stroke'],
  },
  'diabetes': {
    snomed: [
      '44054006',   // Type 2 diabetes
      '46635009',   // Type 1 diabetes
      '73211009',   // Diabetes mellitus
    ],
    icd10: ['E10', 'E11', 'E13'],
    terms: ['diabetes mellitus', 'type 2 diabetes', 'type 1 diabetes', 't2dm', 't1dm', 'diabetic'],
  },
  'hypertension': {
    snomed: ['38341003', '59621000'],
    icd10: ['I10', 'I11', 'I12', 'I13', 'I15'],
    terms: ['hypertension', 'high blood pressure', 'htn', 'essential hypertension'],
  },
  'heart failure': {
    snomed: [
      '84114007',   // Heart failure
      '441481004',  // Chronic systolic heart failure
      '443253003',  // Acute on chronic systolic heart failure
      '446221000',  // Heart failure with preserved ejection fraction
    ],
    icd10: ['I50', 'I50.1', 'I50.2', 'I50.3', 'I50.4', 'I50.9'],
    terms: ['heart failure', 'hf', 'chf', 'congestive heart failure', 'hfref', 'hfpef'],
  },
};

/**
 * RxNorm codes and names for medication classes
 */
const MEDICATION_CODES: Record<string, { rxnorm: string[], terms: string[] }> = {
  // High-intensity statin: atorvastatin 40-80mg, rosuvastatin 20-40mg
  'high-intensity statin': {
    rxnorm: ['83367', '301542'],  // Atorvastatin, Rosuvastatin
    terms: ['atorvastatin', 'rosuvastatin', 'lipitor', 'crestor'],
  },
  'ezetimibe': {
    rxnorm: ['341248'],
    terms: ['ezetimibe', 'zetia'],
  },
  'pcsk9 inhibitor': {
    rxnorm: ['1657974', '1659149'],  // Evolocumab, Alirocumab
    terms: ['evolocumab', 'alirocumab', 'repatha', 'praluent', 'pcsk9'],
  },
  'statin': {
    rxnorm: [
      '83367',   // Atorvastatin
      '301542',  // Rosuvastatin
      '36567',   // Simvastatin
      '42463',   // Pravastatin
      '6472',    // Lovastatin
      '41127',   // Fluvastatin
      '861634',  // Pitavastatin
    ],
    terms: [
      'atorvastatin', 'rosuvastatin', 'simvastatin', 'pravastatin',
      'lovastatin', 'fluvastatin', 'pitavastatin',
      'lipitor', 'crestor', 'zocor', 'pravachol', 'mevacor', 'lescol', 'livalo',
      'statin',
    ],
  },
  'statin therapy': {
    rxnorm: ['83367', '301542', '36567', '42463', '6472', '41127', '861634'],
    terms: [
      'atorvastatin', 'rosuvastatin', 'simvastatin', 'pravastatin',
      'lovastatin', 'fluvastatin', 'pitavastatin',
      'lipitor', 'crestor', 'zocor', 'pravachol', 'mevacor', 'lescol', 'livalo',
      'statin',
    ],
  },
  'ace inhibitor': {
    rxnorm: ['29046', '3827', '35296', '18867', '1998', '50166', '35208', '54552', '38454'],
    terms: [
      'lisinopril', 'enalapril', 'ramipril', 'benazepril', 'captopril',
      'fosinopril', 'quinapril', 'perindopril', 'trandolapril',
      'prinivil', 'zestril', 'vasotec', 'altace', 'lotensin', 'capoten',
    ],
  },
  'arb': {
    rxnorm: ['52175', '69749', '83515', '321064', '73494', '83818', '1091643'],
    terms: [
      'losartan', 'valsartan', 'irbesartan', 'olmesartan', 'telmisartan',
      'candesartan', 'azilsartan',
      'cozaar', 'diovan', 'avapro', 'benicar', 'micardis', 'atacand',
    ],
  },
  'beta blocker': {
    rxnorm: ['6918', '20352', '19484', '1202', '8787', '31555', '6185', '7226'],
    terms: [
      'metoprolol', 'carvedilol', 'bisoprolol', 'atenolol', 'propranolol',
      'nebivolol', 'labetalol', 'nadolol',
      'lopressor', 'toprol', 'coreg', 'zebeta', 'tenormin', 'inderal', 'bystolic',
    ],
  },
  'anticoagulant': {
    rxnorm: ['11289', '1364430', '1232082', '1037045', '1599538'],
    terms: [
      'warfarin', 'apixaban', 'rivaroxaban', 'dabigatran', 'edoxaban',
      'coumadin', 'eliquis', 'xarelto', 'pradaxa', 'savaysa',
      'heparin', 'enoxaparin', 'lovenox',
    ],
  },
  'antiplatelet': {
    rxnorm: ['1191', '32968', '613391', '1116632'],
    terms: ['aspirin', 'clopidogrel', 'prasugrel', 'ticagrelor', 'plavix', 'effient', 'brilinta'],
  },
  'sglt2 inhibitor': {
    rxnorm: ['1545653', '1488564', '1373458', '1992684'],
    terms: [
      'empagliflozin', 'dapagliflozin', 'canagliflozin', 'ertugliflozin',
      'jardiance', 'farxiga', 'invokana', 'steglatro', 'sglt2',
    ],
  },
  'glp1 agonist': {
    rxnorm: ['1991302', '475968', '1534763', '60548', '2395779'],
    terms: [
      'semaglutide', 'liraglutide', 'dulaglutide', 'exenatide', 'tirzepatide',
      'ozempic', 'wegovy', 'victoza', 'trulicity', 'byetta', 'bydureon', 'mounjaro', 'glp-1', 'glp1',
    ],
  },
  'metformin': {
    rxnorm: ['6809'],
    terms: ['metformin', 'glucophage', 'glumetza', 'fortamet', 'riomet'],
  },
  'insulin': {
    rxnorm: ['5856'],
    terms: [
      'insulin', 'lantus', 'basaglar', 'toujeo', 'levemir', 'tresiba',
      'novolog', 'humalog', 'apidra', 'fiasp', 'admelog', 'humulin', 'novolin',
    ],
  },
};

/**
 * Parent condition mappings: if a patient has a broader condition,
 * they qualify for checks on more specific sub-conditions.
 * e.g., "coronary artery disease" qualifies for "prior myocardial infarction" checks
 */
const CONDITION_PARENTS: Record<string, string[]> = {
  'prior myocardial infarction': ['atherosclerotic cardiovascular disease', 'coronary artery disease', 'cardiovascular disease'],
  'prior stroke': ['atherosclerotic cardiovascular disease', 'cardiovascular disease'],
  'peripheral artery disease': ['atherosclerotic cardiovascular disease', 'cardiovascular disease'],
};

/**
 * Check if patient has a specific condition
 * Uses SNOMED, ICD-10 codes, semantic text matching, and hierarchical condition matching
 */
export function hasCondition(patient: ExtractedPatient, conditionIdentifier: string): boolean {
  const normalized = conditionIdentifier.toLowerCase().trim();

  // Direct match first
  if (hasConditionDirect(patient, normalized)) return true;

  // Check if patient has a broader parent condition that qualifies
  const parents = CONDITION_PARENTS[normalized];
  if (parents) {
    for (const parent of parents) {
      if (hasConditionDirect(patient, parent)) return true;
    }
  }

  return false;
}

function hasConditionDirect(patient: ExtractedPatient, normalized: string): boolean {
  // Get condition class definition (codes + terms)
  const conditionClass = CONDITION_CODES[normalized];
  const snomedCodes = conditionClass?.snomed || [];
  const icd10Codes = conditionClass?.icd10 || [];
  const terms = conditionClass?.terms || [normalized];

  return patient.conditions.some(cond => {
    // Check SNOMED code match
    if (cond.snomedCode) {
      if (snomedCodes.includes(cond.snomedCode)) return true;
      if (cond.snomedCode === normalized) return true;
    }

    // Check ICD-10 code match (with prefix matching for subcodes)
    if (cond.icd10Code) {
      for (const code of icd10Codes) {
        if (cond.icd10Code === code || cond.icd10Code.startsWith(code)) return true;
      }
    }

    // Check display name match against all terms
    const condDisplay = cond.display.toLowerCase();
    for (const term of terms) {
      if (condDisplay.includes(term) || term.includes(condDisplay)) {
        return true;
      }
    }

    return false;
  });
}

/**
 * Check if patient is on a specific medication
 * Uses RxNorm codes and semantic text matching
 */
export function hasMedication(patient: ExtractedPatient, medicationName: string): boolean {
  const normalized = medicationName.toLowerCase().trim();

  // Get medication class definition (codes + terms)
  const medClass = MEDICATION_CODES[normalized];
  const rxnormCodes = medClass?.rxnorm || [];
  const terms = medClass?.terms || [normalized];

  return patient.medications.some(med => {
    if (med.status !== 'active' && med.status !== 'intended' && med.status !== 'on-hold') {
      return false;
    }

    // Check RxNorm code match
    if (med.rxnormCode && rxnormCodes.includes(med.rxnormCode)) {
      return true;
    }

    // Check name match against all terms (drug names, brand names)
    const medName = med.name.toLowerCase();
    for (const term of terms) {
      if (medName.includes(term)) {
        return true;
      }
    }

    return false;
  });
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

function getMedicationInfo(
  medicationCodeableConcept: any,
  medicationReference: any,
  medicationMap: Map<string, IMedication>
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
