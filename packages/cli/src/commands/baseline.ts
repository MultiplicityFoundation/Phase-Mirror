import { writeFileSync } from 'fs';
import { computeFileHash, fileExists } from '../utils/hash.js';

export interface BaselineOptions {
  output: string;
}

export async function baselineCommand(options: BaselineOptions) {
  console.log('Creating integrity baseline...');

  const criticalFiles = [
    '.github/workflows/ci.yml',
    '.github/workflows/drift-detection.yml',
    '.github/workflows/merge-queue.yml',
    '.github/workflows/schema-sync-check.yml',
    '.github/CODEOWNERS',
    'infra/terraform/main.tf',
    'infra/terraform/variables.tf',
    'infra/terraform/backend.tf',
    'infra/terraform/monitoring.tf',
    'infra/terraform/baseline-storage.tf',
  ];

  const files: Array<{ path: string; hash: string; exists: boolean }> = [];

  for (const filePath of criticalFiles) {
    const exists = fileExists(filePath);
    if (exists) {
      const hash = await computeFileHash(filePath);
      files.push({ path: filePath, hash, exists: true });
      console.log(`  ✓ ${filePath} - ${hash.substring(0, 12)}...`);
    } else {
      files.push({ path: filePath, hash: '', exists: false });
      console.log(`  ⚠ ${filePath} - not found`);
    }
  }

  const baseline = {
    version: '1.0.0',
    createdAt: new Date().toISOString(),
    files,
    metadata: {
      generatedBy: 'mirror-dissonance-cli',
      fileCount: files.filter(f => f.exists).length,
    },
  };

  writeFileSync(options.output, JSON.stringify(baseline, null, 2));
  console.log(`\n✅ Baseline created: ${options.output}`);
  console.log(`   Files tracked: ${baseline.metadata.fileCount}`);
}
