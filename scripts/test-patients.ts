#!/usr/bin/env npx ts-node

/**
 * Test script to run patient FHIR files against the deployed API
 *
 * Usage:
 *   npx ts-node scripts/test-patients.ts [--local] [--pmid <pmid>]
 *
 * Options:
 *   --local    Use localhost:3000 instead of Vercel deployment
 *   --pmid     PubMed ID to test with (default: 28864332 - FOURIER trial)
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VERCEL_URL = 'https://ehrlitpersonalze.vercel.app';
const LOCAL_URL = 'http://localhost:3000';

interface TestResult {
  patient: string;
  success: boolean;
  applicable?: boolean;
  error?: string;
  summary?: string;
  fullResponse?: any;
}

async function fetchPaperText(baseUrl: string, pmid: string): Promise<string> {
  console.log(`\nFetching paper PMID: ${pmid}...`);

  const response = await fetch(`${baseUrl}/api/fetch-paper`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: pmid, type: 'pmid' }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Failed to fetch paper');
  }

  console.log(`  Paper: ${data.metadata?.title || 'Unknown'}`);
  console.log(`  Open Access: ${data.isOpenAccess ? 'Yes' : 'Abstract only'}`);

  return data.text;
}

async function parsePaper(baseUrl: string, paperText: string): Promise<any> {
  console.log('Parsing paper with Gemini...');

  const response = await fetch(`${baseUrl}/api/parse-paper`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paperText, source: 'pmid' }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Failed to parse paper');
  }

  console.log(`  Intervention: ${data.parsedPaper.intervention}`);
  console.log(`  Primary Endpoint: ${data.parsedPaper.primaryEndpoint}`);

  return data.parsedPaper;
}

async function personalizeForPatient(
  baseUrl: string,
  fhirBundle: any,
  parsedPaper: any,
  patientName: string
): Promise<TestResult> {
  console.log(`\nTesting patient: ${patientName}`);

  try {
    const response = await fetch(`${baseUrl}/api/personalize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fhirBundle, parsedPaper }),
    });

    const data = await response.json();

    if (!response.ok) {
      return {
        patient: patientName,
        success: false,
        error: data.error || 'API error',
      };
    }

    const applicable = data.applicability?.isApplicable ?? true;

    if (applicable && data.personalizedResult) {
      console.log(`  Status: APPLICABLE`);
      console.log(`  Study Summary: ${data.personalizedResult.studySummary.substring(0, 100)}...`);
      return {
        patient: patientName,
        success: true,
        applicable: true,
        summary: data.personalizedResult.studySummary,
        fullResponse: data,
      };
    } else {
      const reasons = data.applicability?.reasons?.map((r: any) => r.description).join('; ') || 'Unknown';
      console.log(`  Status: NOT APPLICABLE`);
      console.log(`  Reasons: ${reasons}`);
      return {
        patient: patientName,
        success: true,
        applicable: false,
        error: reasons,
        fullResponse: data,
      };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.log(`  Status: ERROR - ${message}`);
    return {
      patient: patientName,
      success: false,
      error: message,
    };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const useLocal = args.includes('--local');
  const pmidIndex = args.indexOf('--pmid');
  const pmid = pmidIndex !== -1 ? args[pmidIndex + 1] : '28864332';

  const baseUrl = useLocal ? LOCAL_URL : VERCEL_URL;

  // Create output directory for responses
  const outputDir = path.join(__dirname, '..', 'test-results');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log('='.repeat(60));
  console.log('FHIR Literature Personalization - Patient Test Suite');
  console.log('='.repeat(60));
  console.log(`Target: ${baseUrl}`);
  console.log(`PMID: ${pmid}`);

  // Find FHIR files
  const fhirDir = path.join(__dirname, '..', 'fhir');
  const files = fs.readdirSync(fhirDir)
    .filter(f => f.endsWith('.json') && !f.startsWith('.'));

  console.log(`\nFound ${files.length} patient files`);

  try {
    // Fetch and parse paper once
    const paperText = await fetchPaperText(baseUrl, pmid);
    const parsedPaper = await parsePaper(baseUrl, paperText);

    // Test each patient
    const results: TestResult[] = [];

    for (const file of files) {
      const filePath = path.join(fhirDir, file);
      const fileSize = fs.statSync(filePath).size;

      // Skip files > 10MB to avoid timeout issues
      if (fileSize > 10 * 1024 * 1024) {
        console.log(`\nSkipping ${file} (${(fileSize / 1024 / 1024).toFixed(1)}MB - too large)`);
        results.push({
          patient: file,
          success: false,
          error: 'File too large (>10MB)',
        });
        continue;
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      const fhirBundle = JSON.parse(content);

      const result = await personalizeForPatient(baseUrl, fhirBundle, parsedPaper, file);
      results.push(result);

      // Save full response to file
      if (result.fullResponse) {
        const outputFile = path.join(outputDir, `${file.replace('.json', '')}-result.json`);
        fs.writeFileSync(outputFile, JSON.stringify(result.fullResponse, null, 2));
        console.log(`  Saved to: ${outputFile}`);
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));

    const applicable = results.filter(r => r.success && r.applicable);
    const notApplicable = results.filter(r => r.success && !r.applicable);
    const errors = results.filter(r => !r.success);

    console.log(`\nTotal patients: ${results.length}`);
    console.log(`  Applicable: ${applicable.length}`);
    console.log(`  Not applicable: ${notApplicable.length}`);
    console.log(`  Errors: ${errors.length}`);

    if (applicable.length > 0) {
      console.log('\nApplicable patients:');
      applicable.forEach(r => console.log(`  - ${r.patient}`));
    }

    if (notApplicable.length > 0) {
      console.log('\nNot applicable:');
      notApplicable.forEach(r => console.log(`  - ${r.patient}: ${r.error}`));
    }

    if (errors.length > 0) {
      console.log('\nErrors:');
      errors.forEach(r => console.log(`  - ${r.patient}: ${r.error}`));
    }

  } catch (error) {
    console.error('\nFatal error:', error);
    process.exit(1);
  }
}

main();
