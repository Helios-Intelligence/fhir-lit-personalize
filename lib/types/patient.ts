/**
 * Observation value with metadata
 */
export interface ObservationValue {
  value: number | string;
  unit?: string;
  date: string;
  loincCode?: string;
  display?: string;
  interpretation?: string;
}

/**
 * Patient condition with SNOMED and ICD-10 coding
 */
export interface PatientCondition {
  display: string;
  snomedCode?: string;
  icd10Code?: string;
  clinicalStatus: string;
  onsetDate?: string;
}

/**
 * Patient medication with RxNorm coding
 */
export interface PatientMedication {
  name: string;
  status: string;
  dosage?: string;
  startDate?: string;
  rxnormCode?: string;
}

/**
 * Extracted patient data from FHIR bundle
 */
export interface ExtractedPatient {
  age: number | null;
  sex: 'male' | 'female' | 'other' | 'unknown';
  birthDate?: string;
  name?: string;
  observations: Map<string, ObservationValue>;
  conditions: PatientCondition[];
  medications: PatientMedication[];
}

/**
 * Common LOINC codes for biomarkers
 */
export const LOINC_CODES = {
  LDL: '18262-6',
  HDL: '2085-9',
  TOTAL_CHOLESTEROL: '2093-3',
  TRIGLYCERIDES: '2571-8',
  NON_HDL_CHOLESTEROL: '43396-1',
  APOLIPOPROTEIN_B: '1884-6',
  LIPOPROTEIN_A: '10835-7',
  VITAMIN_D: '1989-3',  // 25-hydroxyvitamin D total
  VITAMIN_D_25: '35365-6',  // 25-hydroxyvitamin D3
  HBA1C: '4548-4',
  FASTING_GLUCOSE: '1558-6',
  EGFR: '33914-3',
  CREATININE: '2160-0',
  BUN: '3094-0',
  ALT: '1742-6',
  AST: '1920-8',
  SYSTOLIC_BP: '8480-6',
  DIASTOLIC_BP: '8462-4',
  BMI: '39156-5',
  WEIGHT: '29463-7',
  HEIGHT: '8302-2',
} as const;

/**
 * Common SNOMED codes for cardiovascular conditions
 */
export const SNOMED_CODES = {
  MYOCARDIAL_INFARCTION: '22298006',
  STROKE: '230690007',
  TYPE_2_DIABETES: '44054006',
  HYPERTENSION: '38341003',
  HEART_FAILURE: '84114007',
  ATRIAL_FIBRILLATION: '49436004',
  CORONARY_ARTERY_DISEASE: '53741008',
  PERIPHERAL_ARTERY_DISEASE: '840580004',
  CHRONIC_KIDNEY_DISEASE: '709044004',
  HYPERLIPIDEMIA: '55822004',
} as const;

/**
 * Mapping of biomarker names to LOINC codes
 */
export const BIOMARKER_LOINC_MAP: Record<string, string[]> = {
  'ldl': [LOINC_CODES.LDL],
  'ldl-c': [LOINC_CODES.LDL],
  'ldl cholesterol': [LOINC_CODES.LDL],
  'hdl': [LOINC_CODES.HDL],
  'hdl-c': [LOINC_CODES.HDL],
  'hdl cholesterol': [LOINC_CODES.HDL],
  'total cholesterol': [LOINC_CODES.TOTAL_CHOLESTEROL],
  'cholesterol': [LOINC_CODES.TOTAL_CHOLESTEROL],
  'triglycerides': [LOINC_CODES.TRIGLYCERIDES],
  'non-hdl cholesterol': [LOINC_CODES.NON_HDL_CHOLESTEROL],
  'non-hdl': [LOINC_CODES.NON_HDL_CHOLESTEROL],
  'apolipoprotein b': [LOINC_CODES.APOLIPOPROTEIN_B],
  'apob': [LOINC_CODES.APOLIPOPROTEIN_B],
  'apo b': [LOINC_CODES.APOLIPOPROTEIN_B],
  'lipoprotein(a)': [LOINC_CODES.LIPOPROTEIN_A],
  'lp(a)': [LOINC_CODES.LIPOPROTEIN_A],
  'vitamin d': [LOINC_CODES.VITAMIN_D, LOINC_CODES.VITAMIN_D_25],
  '25-hydroxyvitamin d': [LOINC_CODES.VITAMIN_D, LOINC_CODES.VITAMIN_D_25],
  '25-oh vitamin d': [LOINC_CODES.VITAMIN_D, LOINC_CODES.VITAMIN_D_25],
  'hba1c': [LOINC_CODES.HBA1C],
  'hemoglobin a1c': [LOINC_CODES.HBA1C],
  'glycated hemoglobin': [LOINC_CODES.HBA1C],
  'fasting glucose': [LOINC_CODES.FASTING_GLUCOSE],
  'blood glucose': [LOINC_CODES.FASTING_GLUCOSE],
  'egfr': [LOINC_CODES.EGFR],
  'creatinine': [LOINC_CODES.CREATININE],
  'bun': [LOINC_CODES.BUN],
  'alt': [LOINC_CODES.ALT],
  'ast': [LOINC_CODES.AST],
  'systolic blood pressure': [LOINC_CODES.SYSTOLIC_BP],
  'systolic bp': [LOINC_CODES.SYSTOLIC_BP],
  'diastolic blood pressure': [LOINC_CODES.DIASTOLIC_BP],
  'diastolic bp': [LOINC_CODES.DIASTOLIC_BP],
  'bmi': [LOINC_CODES.BMI],
  'body mass index': [LOINC_CODES.BMI],
};
