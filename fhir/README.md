# FHIR Test Fixtures

This directory contains FHIR R4 Bundle JSON files for testing the Helios API.

## Sample Test Files

These are synthetic test fixtures in proper FHIR R4 Bundle format:

| File | Description | Key Data |
|------|-------------|----------|
| `sample-ehr-diabetes.json` | Type 2 diabetes patient | HbA1c 8.2%, elevated glucose, reduced eGFR, hypertension |
| `sample-ehr-cardiac.json` | Cardiac patient | CAD, AFib, HFpEF, elevated BNP, lipid abnormalities |
| `sample-ehr-minimal.json` | Minimal test case | Just 2 abnormal labs (LDL, Vitamin D) |

## Real Patient Files (not committed)

Your real FHIR files (e.g., `elliot.json`, `ashwin.json`, `stephan.json`) can also be placed here for testing.

## Usage

### For existing test scripts (pre-extracted data format expected)

The original test scripts now use this folder:
```bash
# Light Agent - uses sample-ehr-diabetes.json by default
pnpm tsx testing/scripts/test-light-agent-prod.ts

# Deep Agent - uses sample-ehr-diabetes.json by default
pnpm tsx testing/scripts/test-deep-agent-prod.ts

# Local testing with custom fixture
TEST_FIXTURE=sample-ehr-cardiac.json pnpm tsx testing/scripts/test-light-agent.ts
```

### For FHIR-based test scripts (raw FHIR Bundle format)

These scripts parse raw FHIR Bundles using `extractFHIRData()`:
```bash
# Test with real FHIR data
pnpm tsx testing/scripts/test-light-agent-fhir.ts elliot.json
pnpm tsx testing/scripts/test-deep-agent-fhir.ts ashwin.json

# Test with sample FHIR bundles
pnpm tsx testing/scripts/test-light-agent-fhir.ts sample-ehr-diabetes.json
```

## FHIR Bundle Format

Files must be valid FHIR R4 Bundles with `resourceType: "Bundle"`:

```json
{
  "resourceType": "Bundle",
  "type": "searchset",
  "entry": [
    {
      "fullUrl": "urn:uuid:patient-id",
      "resource": {
        "resourceType": "Patient",
        "id": "patient-id",
        "name": [{"family": "LastName", "given": ["FirstName"]}],
        "gender": "male",
        "birthDate": "1980-01-01"
      }
    },
    {
      "fullUrl": "urn:uuid:observation-id",
      "resource": {
        "resourceType": "Observation",
        "category": [{"coding": [{"code": "laboratory"}]}],
        "code": {"coding": [{"system": "http://loinc.org", "code": "..."}]},
        "valueQuantity": {"value": 123, "unit": "mg/dL"},
        ...
      }
    }
  ]
}
```

## Supported Resource Types

The FHIR extractor handles these resource types:
- `Patient` - Demographics, age calculation
- `Observation` - Lab results (with interpretation, reference ranges)
- `Condition` - Diagnoses, medical history
- `FamilyMemberHistory` - Family health history
- `MedicationStatement` / `MedicationRequest` - Current medications
- `DiagnosticReport` - Imaging studies, reports
- `ImagingStudy` - Imaging procedures

## Notes

- Files in this directory are **not tracked by git** (via `.gitignore`)
- Sample files use synthetic data only
- Real patient FHIR files should never be committed to the repository
