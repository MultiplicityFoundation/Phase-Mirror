---
applyTo: "packages/mirror-dissonance/src/adapters/**"
---
# Adapter Layer Instructions

- Every adapter implements interfaces from `adapters/types.ts`
- Factory (`createAdapters`) uses dynamic import by CLOUD_PROVIDER env var
- Supported providers: aws, gcp, local
- Local adapter: JSON file-based, zero-cloud testing
- GCP adapter: Firestore, Secret Manager, Cloud Storage, Cloud KMS
- AWS adapter: DynamoDB, SSM, S3, KMS
- After refactor, `grep -r 'aws-sdk' src/ --include='*.ts' | grep -v 'adapters/aws'` must return empty
- FPStoreAdapter errors MUST throw FPStoreError with operation context
