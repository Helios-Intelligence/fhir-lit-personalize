# Personalized Medical Literature Tool — Spec v0.1

## Overview

A lightweight tool that takes a patient's biomarker data (extracted from a FHIR JSON file) and a research paper, then generates a personalized explanation of how the study's findings apply to that specific individual.

**Core value proposition:** Translate clinical research into patient-specific, actionable insights by combining structured health data with natural language reasoning.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  1. PARSE PAPER                                                 │
│     LLM extracts: biomarkers, inclusion criteria, demographics  │
│     Output: ["LDL", "HbA1c", ...], criteria, population         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  2. QUERY FHIR JSON                                             │
│     Pull relevant resources based on Step 1                     │
│     Output: { LDL: 142, HbA1c: 6.8, age: 54, conditions: [...]} │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│  3. CHECK APPLICABILITY                                         │
│     Does patient meet inclusion criteria & demographics?        │
│     If NO → STOP and return "Paper does not apply" message      │
└─────────────────────────────────────────────────────────────────┘
                              ↓ (if YES)
┌─────────────────────────────────────────────────────────────────┐
│  4. GENERATE PERSONALIZED OUTPUT                                │
│     LLM receives: paper full-text + extracted patient values    │
│     Dynamically reasons about how findings apply to patient     │
└─────────────────────────────────────────────────────────────────┘
```

### Approach: Paper-first with dynamic LLM interpretation

- **Paper drives extraction:** The paper determines what gets pulled from FHIR, not the other way around. This ensures we only fetch clinically relevant data.
- **Multiple biomarkers supported:** A single paper may discuss several biomarkers (e.g., LDL, triglycerides, CRP). All relevant ones are extracted and matched.
- **Applicability gate:** If the patient doesn't meet the study's inclusion criteria or demographic profile, analysis stops early with a clear, informative explanation rather than producing misleading results.
- **Dynamic interpretation:** No hardcoded threshold schemas. The LLM reads the paper and patient values together, then reasons about risk/applicability in a single pass.

---

## Step-by-Step Implementation Details

### Step 1: Parse Paper

**Goal:** Extract structured information from the research paper that will guide FHIR querying and applicability checking.

**What to extract:**

| Field | Description | Example |
|-------|-------------|---------|
| `biomarkers` | List of biomarkers/lab values discussed | `["LDL cholesterol", "HbA1c", "triglycerides"]` |
| `inclusion_criteria` | Who was eligible for the study | `"Adults aged 40-75 with established cardiovascular disease on statin therapy"` |
| `exclusion_criteria` | Who was excluded | `"Patients with active liver disease, pregnant women, eGFR < 20"` |
| `population_demographics` | Age range, sex distribution, relevant conditions | `{ "age_range": "40-75", "conditions": ["CVD", "MI", "stroke"] }` |
| `intervention` | What was tested | `"Evolocumab 140mg every 2 weeks added to statin"` |
| `primary_endpoint` | Main outcome measured | `"Composite of cardiovascular death, MI, stroke, hospitalization for unstable angina, or coronary revascularization"` |
| `key_findings` | Main results with effect sizes | `"LDL reduced by 59%, cardiovascular events reduced by 15% (HR 0.85, 95% CI 0.79-0.92)"` |
| `follow_up_duration` | How long patients were followed | `"Median 2.2 years"` |
| `baseline_risk` | Event rate in control group | `"11.3% in placebo group over median 2.2 years"` |

**Output format (JSON):**
```json
{
  "biomarkers": ["LDL cholesterol"],
  "inclusion_criteria": "Adults aged 40-75 with clinical atherosclerotic cardiovascular disease, on optimized statin therapy, with LDL ≥70 mg/dL or non-HDL ≥100 mg/dL",
  "exclusion_criteria": "Uncontrolled hypertension, NYHA class III/IV heart failure, hemorrhagic stroke within past 12 months",
  "population_demographics": {
    "age_range": "40-75",
    "median_age": 63,
    "male_percentage": 75,
    "required_conditions": ["atherosclerotic CVD"],
    "required_medications": ["statin"]
  },
  "intervention": "Evolocumab 140mg subcutaneous every 2 weeks or 420mg monthly",
  "primary_endpoint": "Composite of CV death, MI, stroke, hospitalization for unstable angina, coronary revascularization",
  "key_findings": {
    "ldl_reduction_percent": 59,
    "relative_risk_reduction_percent": 15,
    "hazard_ratio": 0.85,
    "ci_95": [0.79, 0.92],
    "nnt_2_years": 74
  },
  "follow_up_duration": "2.2 years median",
  "baseline_event_rate": 0.113
}
```

---

### Step 2: Query FHIR JSON

**Goal:** Extract patient data that corresponds to what the paper discusses.

**Input:** FHIR Bundle JSON file + list of relevant fields from Step 1

**FHIR Resource Mapping:**

| Paper mentions | FHIR Resource | Path to value |
|----------------|---------------|---------------|
| LDL cholesterol | `Observation` | `code.coding[].display` = "LDL Cholesterol", value in `valueQuantity.value` |
| HbA1c | `Observation` | LOINC code `4548-4`, value in `valueQuantity.value` |
| Age | `Patient` | Calculate from `birthDate` |
| Sex | `Patient` | `gender` field |
| Diagnoses/conditions | `Condition` | `code.coding[].display` or SNOMED codes |
| Current medications | `MedicationRequest` | `medicationCodeableConcept.coding[].display` |
| eGFR | `Observation` | LOINC code `33914-3` or `48642-3` |

**Common LOINC codes to recognize:**

| Biomarker | LOINC Code |
|-----------|------------|
| LDL Cholesterol | `18262-6` (direct), `13457-7` (calculated) |
| HbA1c | `4548-4` |
| Total Cholesterol | `2093-3` |
| HDL Cholesterol | `2085-9` |
| Triglycerides | `2571-8` |
| eGFR | `33914-3`, `48642-3` |
| Creatinine | `2160-0` |
| Blood Pressure Systolic | `8480-6` |
| Blood Pressure Diastolic | `8462-4` |

**Common SNOMED codes for conditions:**

| Condition | SNOMED Code |
|-----------|-------------|
| Myocardial infarction | `22298006` |
| Stroke | `230690007` |
| Type 2 diabetes | `44054006` |
| Hypertension | `38341003` |
| Heart failure | `84114007` |
| Atrial fibrillation | `49436004` |

**Output format (JSON):**
```json
{
  "patient": {
    "age": 58,
    "sex": "male"
  },
  "observations": {
    "LDL": { "value": 150, "unit": "mg/dL", "date": "2024-01-15" },
    "HbA1c": { "value": 6.8, "unit": "%", "date": "2024-01-10" }
  },
  "conditions": [
    { "name": "Myocardial infarction", "code": "22298006", "onset": "2020-03-01" },
    { "name": "Hyperlipidemia", "code": "55822004", "onset": "2018-06-15" }
  ],
  "medications": [
    { "name": "Atorvastatin 40mg", "status": "active" },
    { "name": "Aspirin 81mg", "status": "active" }
  ]
}
```

---

### Step 3: Check Applicability

**Goal:** Determine if this paper's findings can reasonably be applied to this patient.

**Check the following:**

1. **Age in range?** Compare patient age to study's age range
2. **Required conditions present?** Does patient have the conditions the study required (e.g., "established CVD")
3. **Required medications?** Is patient on baseline therapy the study required (e.g., "on statin therapy")
4. **Exclusion criteria violated?** Does patient have any conditions that would have excluded them from the study
5. **Relevant biomarker available?** Do we have the lab value the paper discusses

**Decision logic:**

```
IF patient age NOT in study age_range:
    → STOP: "This study enrolled patients aged X-Y. You are [age], so these findings may not directly apply."

IF patient missing required_conditions:
    → STOP: "This study was conducted in patients with [condition]. Your records don't show this diagnosis."

IF patient has exclusion condition:
    → STOP: "This study excluded patients with [condition], which appears in your records."

IF biomarker not found in FHIR:
    → STOP: "We couldn't find your [biomarker] value in your records. This is needed to personalize the findings."

IF all checks pass:
    → CONTINUE to Step 4
```

**Output on STOP:**
```json
{
  "applicable": false,
  "reason": "age_out_of_range",
  "message": "This study enrolled patients aged 40-75 with established cardiovascular disease. At 82 years old, you fall outside the study population, so we cannot confidently apply these findings to your situation. The benefits and risks may differ for older adults."
}
```

**Output on CONTINUE:**
```json
{
  "applicable": true,
  "matches": [
    "Age 58 within study range (40-75)",
    "Has established CVD (prior MI)",
    "Currently on statin therapy (Atorvastatin)",
    "LDL available (150 mg/dL)"
  ]
}
```

---

### Step 4: Generate Personalized Output

**Goal:** Produce a plain-language explanation that personalizes the study findings to this patient.

**The output must include three components:**

#### Component 1: Study Summary
Explain what the study found in 1-2 sentences. Include:
- The intervention tested
- The main effect on the biomarker
- The clinical outcome benefit

#### Component 2: Patient-Specific Projection
Apply the study's effect sizes to the patient's actual values:
- If paper says "59% LDL reduction" and patient LDL is 150 → project to ~60-65 mg/dL
- Include appropriate hedging ("typically", "on average", "individual responses vary")

#### Component 3: Contextualized Risk
Translate relative risk reductions into absolute terms the patient can understand:
- Use "N out of 100 people" framing
- Reference the study's baseline event rate
- Be clear about timeframe
- Acknowledge that risk isn't eliminated, just reduced

**Prompt guidance for LLM:**

```
You are explaining research findings to a patient. You have:

1. Paper summary: [from Step 1]
2. Patient data: [from Step 2]
3. Applicability confirmed: [from Step 3]

Generate a personalized explanation following this structure:

FIRST PARAGRAPH - Study Summary:
- What was studied and what it found
- Keep it factual and simple

SECOND PARAGRAPH - Personal Projection:
- Apply the study's findings to their specific biomarker value
- Use their actual numbers
- Include appropriate uncertainty ("typically", "on average")

THIRD PARAGRAPH - Risk in Context:
- Convert relative risk to absolute risk using "X out of 100 people" framing
- Use the study's baseline event rate and follow-up duration
- Be honest that risk is reduced, not eliminated
- Make it tangible and understandable

TONE:
- Conversational but accurate
- No medical jargon without explanation
- Empowering, not alarming
- Always include appropriate caveats
```

---

## Inputs

| Input | Description | Example |
|-------|-------------|---------|
| **FHIR JSON** | Patient bundle export file | `patient_bundle.json` |
| **Paper** | Full-text PDF upload OR open-access PMID/DOI | See below |

### FHIR JSON Input

The tool accepts a FHIR Bundle JSON file containing patient data. It parses and extracts:

- **Observation** resources → biomarker values (LDL, HbA1c, etc.)
- **Condition** resources → patient diagnoses
- **MedicationRequest** resources → current medications
- **Patient** resource → demographics (age, sex)

**Example FHIR Bundle structure:**
```json
{
  "resourceType": "Bundle",
  "type": "collection",
  "entry": [
    {
      "resource": {
        "resourceType": "Patient",
        "birthDate": "1966-03-15",
        "gender": "male"
      }
    },
    {
      "resource": {
        "resourceType": "Observation",
        "code": {
          "coding": [{ "system": "http://loinc.org", "code": "18262-6", "display": "LDL Cholesterol" }]
        },
        "valueQuantity": { "value": 150, "unit": "mg/dL" },
        "effectiveDateTime": "2024-01-15"
      }
    },
    {
      "resource": {
        "resourceType": "Condition",
        "code": {
          "coding": [{ "system": "http://snomed.info/sct", "code": "22298006", "display": "Myocardial infarction" }]
        },
        "onsetDateTime": "2020-03-01"
      }
    },
    {
      "resource": {
        "resourceType": "MedicationRequest",
        "status": "active",
        "medicationCodeableConcept": {
          "coding": [{ "display": "Atorvastatin 40 MG Oral Tablet" }]
        }
      }
    }
  ]
}
```

### Paper Input Options

**Option A: PDF Upload**
```
Upload: fourier_trial.pdf
```

**Option B: PMID/DOI (open access only)**
```
PMID: 28864332
DOI: 10.1056/NEJMoa1700328
```

Example paper: *"Evolocumab and Clinical Outcomes in Patients with Cardiovascular Disease"* (FOURIER Trial, NEJM 2017)

> ⚠️ **Constraint:** If a PMID or DOI is provided but the paper is not open access, the tool must **fail with an error** prompting the user to upload a PDF instead. Do not attempt to summarize from abstracts alone.

---

## Output

A plain-language, personalized explanation with three components:

1. **Study summary** — what the intervention did and its effect
2. **Patient-specific projection** — applies the study's findings to their actual values
3. **Contextualized risk** — translates relative risk into concrete, understandable absolute terms

---

## Example Flow

**Input:**
- FHIR JSON: `patient_bundle.json`
- Paper: PMID 28864332 (FOURIER Trial)

**Step 1 - Parsed from paper:**
- Biomarkers: LDL cholesterol
- Inclusion: Adults 40-75 with atherosclerotic CVD on statin therapy
- Intervention: Evolocumab (PCSK9 inhibitor)
- Key finding: 59% LDL reduction, 15% relative risk reduction for CV events
- Baseline event rate: 11.3% over 2.2 years

**Step 2 - Extracted from FHIR:**
- Age: 58, Male
- LDL: 150 mg/dL
- Conditions: Prior MI (2020), Hyperlipidemia
- Medications: Atorvastatin 40mg (active)

**Step 3 - Applicability check:**
✓ Age 58 within range (40-75)
✓ Has established CVD (prior MI)
✓ On statin therapy (Atorvastatin)
✓ LDL value available
→ **PROCEED**

**Step 4 - Generated output:**

> "The FOURIER trial found that adding the PCSK9 inhibitor evolocumab to statin therapy lowered LDL cholesterol by about 59% and reduced cardiovascular events by 15%."
>
> "Since your LDL is 150 mg/dL, after starting evolocumab we'd typically expect your LDL to fall to around 60–65 mg/dL, though individual responses may vary."
>
> "For you, the 15% reduction means this: if we imagine 100 people like you (same overall heart-risk profile), over about 2 years we'd expect about 11 out of 100 to have a serious heart-related event without evolocumab, versus about 10 out of 100 with evolocumab. So it doesn't make the risk zero, but it lowers the chance—by about 1 fewer person out of every 100 over that time."

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| PMID/DOI provided but not open access | **Fail** — return: `"Paper not open access. Please upload a PDF of the full text."` |
| FHIR JSON invalid or malformed | **Fail** — return: `"Invalid FHIR Bundle format. Please check the file structure."` |
| Required biomarker not found in FHIR | **Fail** — return: `"Could not find [biomarker] in your records. This value is needed to personalize the study findings."` |
| Patient does not meet inclusion criteria | **Stop** — return: `"This study may not apply to you because [specific reason]. The study enrolled [criteria], but your profile shows [mismatch]. Discuss with your doctor whether these findings are still relevant."` |
| Patient meets exclusion criteria | **Stop** — return: `"This study excluded patients with [condition], which appears in your records. The findings may not safely apply to your situation."` |
| Paper doesn't discuss any extractable biomarker | **Warn** — return partial result with caveat: `"This paper doesn't focus on specific biomarker thresholds, so we can provide a general summary but not a personalized projection."` |

---

## Scope (MVP)

- FHIR JSON file parsing for patient data
- Single paper input (may contain multiple biomarkers)
- PDF upload or open-access PMID/DOI
- Applicability check before analysis (inclusion/exclusion criteria, demographics)
- Text output only
