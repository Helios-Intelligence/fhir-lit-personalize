#!/usr/bin/env npx ts-node

/**
 * Generate PDF reports from test results
 * Creates HTML files that can be printed to PDF
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface TestResult {
  success: boolean;
  applicability?: {
    isApplicable: boolean;
    reasons: Array<{ type: string; description: string; details?: string }>;
  };
  personalizedResult?: {
    studySummary: string;
    patientProjection: string;
    contextualizedRisk: string;
  };
  patientSummary?: {
    age: number | null;
    sex: string;
    relevantBiomarkers: Array<{ name: string; value: string; unit?: string; date: string }>;
    relevantConditions: string[];
    relevantMedications: string[];
  };
  paperSummary?: {
    title?: string;
    intervention?: string;
    primaryEndpoint?: string;
    population?: string;
    followUp?: string;
  };
}

function generateHTML(result: TestResult, patientName: string): string {
  const patient = result.patientSummary;
  const paper = result.paperSummary;
  const personalized = result.personalizedResult;
  const applicability = result.applicability;

  const isApplicable = applicability?.isApplicable ?? false;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Personalized Literature Report - ${patientName}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #1a1a1a;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 20px;
    }
    h1 { font-size: 24px; margin-bottom: 8px; color: #111; }
    h2 { font-size: 18px; margin: 24px 0 12px; color: #333; border-bottom: 2px solid #e5e5e5; padding-bottom: 8px; }
    h3 { font-size: 16px; margin: 16px 0 8px; color: #444; }
    p { margin-bottom: 12px; }
    .header { margin-bottom: 32px; }
    .subtitle { color: #666; font-size: 14px; }
    .section { margin-bottom: 24px; }
    .card {
      background: #f8f9fa;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 16px;
      border-left: 4px solid #4a90d9;
    }
    .card.warning { border-left-color: #f0ad4e; background: #fff9e6; }
    .card.success { border-left-color: #5cb85c; background: #f0fff0; }
    .card.info { border-left-color: #5bc0de; background: #f0f9ff; }
    .card-title { font-weight: 600; margin-bottom: 8px; color: #333; }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 12px;
      margin: 2px;
    }
    .badge-condition { background: #e8d5f0; color: #6b3d7d; }
    .badge-medication { background: #d5f0e8; color: #2d6b4f; }
    .badge-biomarker { background: #d5e8f0; color: #2d4f6b; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .stat { text-align: center; padding: 12px; background: #fff; border-radius: 6px; }
    .stat-value { font-size: 24px; font-weight: 700; color: #333; }
    .stat-label { font-size: 12px; color: #666; text-transform: uppercase; }
    .reason-item {
      padding: 12px;
      background: #fff;
      border-radius: 6px;
      margin-bottom: 8px;
      border: 1px solid #e5e5e5;
    }
    .reason-type {
      font-size: 11px;
      text-transform: uppercase;
      color: #999;
      margin-bottom: 4px;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e5e5e5;
      font-size: 12px;
      color: #666;
    }
    @media print {
      body { padding: 20px; }
      .card { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Personalized Literature Report</h1>
    <p class="subtitle">Generated ${new Date().toLocaleDateString()}</p>
  </div>

  <div class="section">
    <h2>Patient Summary</h2>
    <div class="grid">
      <div class="stat">
        <div class="stat-value">${patient?.age ?? 'N/A'}</div>
        <div class="stat-label">Age</div>
      </div>
      <div class="stat">
        <div class="stat-value">${patient?.sex ? patient.sex.charAt(0).toUpperCase() + patient.sex.slice(1) : 'N/A'}</div>
        <div class="stat-label">Sex</div>
      </div>
    </div>

    ${patient?.relevantConditions && patient.relevantConditions.length > 0 ? `
    <h3>Conditions</h3>
    <div>
      ${patient.relevantConditions.map(c => `<span class="badge badge-condition">${c}</span>`).join(' ')}
    </div>
    ` : ''}

    ${patient?.relevantMedications && patient.relevantMedications.length > 0 ? `
    <h3>Medications</h3>
    <div>
      ${patient.relevantMedications.slice(0, 10).map(m => `<span class="badge badge-medication">${m}</span>`).join(' ')}
      ${patient.relevantMedications.length > 10 ? `<span class="badge">+${patient.relevantMedications.length - 10} more</span>` : ''}
    </div>
    ` : ''}

    ${patient?.relevantBiomarkers && patient.relevantBiomarkers.length > 0 ? `
    <h3>Relevant Lab Values</h3>
    <div>
      ${patient.relevantBiomarkers.map(b => `<span class="badge badge-biomarker">${b.name}: ${b.value}${b.unit ? ' ' + b.unit : ''}</span>`).join(' ')}
    </div>
    ` : ''}
  </div>

  <div class="section">
    <h2>Study Information</h2>
    <div class="card info">
      <div class="card-title">${paper?.title || 'Untitled Study'}</div>
      ${paper?.intervention ? `<p><strong>Intervention:</strong> ${paper.intervention}</p>` : ''}
      ${paper?.primaryEndpoint ? `<p><strong>Primary Endpoint:</strong> ${paper.primaryEndpoint}</p>` : ''}
      ${paper?.followUp ? `<p><strong>Follow-up:</strong> ${paper.followUp}</p>` : ''}
    </div>
  </div>

  ${isApplicable && personalized ? `
  <div class="section">
    <h2>Personalized Findings</h2>

    <div class="card success">
      <div class="card-title">Study Summary</div>
      <p>${personalized.studySummary}</p>
    </div>

    <div class="card">
      <div class="card-title">What This Means For You</div>
      <p>${personalized.patientProjection}</p>
    </div>

    <div class="card">
      <div class="card-title">Putting The Numbers In Context</div>
      <p>${personalized.contextualizedRisk}</p>
    </div>
  </div>
  ` : `
  <div class="section">
    <h2>Applicability Assessment</h2>
    <div class="card warning">
      <div class="card-title">This study may not directly apply to this patient</div>
      <p>Based on the patient's health records, the findings from this study might not be directly applicable.</p>
    </div>

    ${applicability?.reasons && applicability.reasons.length > 0 ? `
    <h3>Reasons</h3>
    ${applicability.reasons.map(r => `
    <div class="reason-item">
      <div class="reason-type">${r.type}</div>
      <p><strong>${r.description}</strong></p>
      ${r.details ? `<p style="color: #666; font-size: 14px;">${r.details}</p>` : ''}
    </div>
    `).join('')}
    ` : ''}
  </div>
  `}

  <div class="footer">
    <p><strong>Important:</strong> This personalized summary is based on a research study and health data.
    It is not medical advice. Always discuss treatment decisions with your healthcare provider.
    Individual results may vary from study findings.</p>
    <p style="margin-top: 12px;">Generated by FHIR Literature Personalization Tool</p>
  </div>
</body>
</html>`;
}

async function main() {
  const resultsDir = path.join(__dirname, '..', 'test-results');
  const htmlDir = path.join(__dirname, '..', 'test-results', 'html');
  const pdfDir = path.join(__dirname, '..', 'test-results', 'pdf');

  if (!fs.existsSync(htmlDir)) {
    fs.mkdirSync(htmlDir, { recursive: true });
  }
  if (!fs.existsSync(pdfDir)) {
    fs.mkdirSync(pdfDir, { recursive: true });
  }

  const files = fs.readdirSync(resultsDir).filter(f => f.endsWith('-result.json'));

  console.log(`Found ${files.length} result files`);

  // Generate HTML files first
  for (const file of files) {
    const patientName = file.replace('-result.json', '');
    const content = fs.readFileSync(path.join(resultsDir, file), 'utf-8');
    const result: TestResult = JSON.parse(content);

    const html = generateHTML(result, patientName);
    const outputFile = path.join(htmlDir, `${patientName}-report.html`);
    fs.writeFileSync(outputFile, html);

    console.log(`Generated HTML: ${outputFile}`);
  }

  // Generate PDFs using puppeteer
  console.log('\nGenerating PDFs...');
  const puppeteer = await import('puppeteer');
  const browser = await puppeteer.default.launch({ headless: true });

  for (const file of files) {
    const patientName = file.replace('-result.json', '');
    const htmlFile = path.join(htmlDir, `${patientName}-report.html`);
    const pdfFile = path.join(pdfDir, `${patientName}-report.pdf`);

    const page = await browser.newPage();
    await page.goto(`file://${htmlFile}`, { waitUntil: 'networkidle0' });
    await page.pdf({
      path: pdfFile,
      format: 'A4',
      margin: { top: '20mm', right: '20mm', bottom: '20mm', left: '20mm' },
      printBackground: true,
    });
    await page.close();

    console.log(`Generated PDF: ${pdfFile}`);
  }

  await browser.close();

  console.log(`\nPDFs saved to: ${pdfDir}`);
}

main();
