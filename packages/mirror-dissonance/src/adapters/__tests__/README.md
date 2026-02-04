# Adapter Parity Tests

This directory contains interface conformance tests that ensure all cloud provider adapters (AWS, GCP, Local) implement the same semantics and maintain API parity.

## Purpose

The adapter parity tests serve as guardrails to prevent multi-cloud abstraction drift. They verify that:

1. **Interface conformance**: All adapters implement the same interfaces correctly
2. **Semantic equivalence**: Operations produce equivalent results across providers
3. **Contract compliance**: Adapters respect the same contracts for error handling, edge cases, and behavior

## Test Coverage

The parity test suite covers all six adapter interfaces:

### FPStore (False Positive Store)
- Record false positive events
- Check if findings are marked as false positives
- Filter false positives by rule ID

### ConsentStore (Consent Management)
- Grant and check resource consent
- Revoke consent
- Handle consent expiration
- Check multiple resources
- Support legacy consent methods
- Enforce k-anonymity

### BlockCounter (Rate Limiting)
- Increment counters
- Get current counts
- Handle concurrent increments
- Use TTL buckets

### SecretStore (Nonce Storage)
- Rotate nonce values
- Retrieve current nonce
- Handle multiple rotations
- Support version tracking

### BaselineStorage (Drift Baselines)
- Store baselines (string and Buffer)
- Retrieve baselines
- List all baselines with metadata
- Delete baselines
- Handle versioning

### CalibrationStore (FP Calibration)
- Enforce k-anonymity requirements
- Aggregate false positives by rule
- Calculate FP rates
- Provide privacy guarantees

## Running Tests

### All Adapters (Local Only)

```bash
pnpm test packages/mirror-dissonance/src/adapters/__tests__/adapter-parity.test.ts
```

The local adapter tests run by default. AWS and GCP adapter tests are skipped unless credentials are configured.

### With Cloud Credentials

To test AWS adapters:

```bash
export AWS_ACCESS_KEY_ID=your-key
export AWS_SECRET_ACCESS_KEY=your-secret
export AWS_REGION=us-east-1
pnpm test adapter-parity
```

To test GCP adapters:

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/credentials.json
export GCP_PROJECT_ID=your-project-id
pnpm test adapter-parity
```

## Test Structure

The parity test suite uses a factory pattern:

```typescript
interface ProviderTestConfig {
  name: string;              // Provider name (AWS, GCP, Local)
  factory: AdapterFactory;   // Function to create adapters
  config: CloudConfig;       // Provider-specific configuration
  cleanup?: CleanupFunction; // Optional cleanup logic
  skip?: boolean;            // Skip tests if credentials missing
  skipReason?: string;       // Reason for skipping
}
```

Each provider runs the same test suite through `runAdapterParityTests()`, ensuring identical behavior across all implementations.

## Adding New Providers

To add a new provider (e.g., Azure):

1. Implement all six adapter interfaces
2. Create an adapter factory function
3. Add a test configuration in `adapter-parity.test.ts`:

```typescript
describe('Azure Provider', () => {
  runAdapterParityTests({
    name: 'Azure',
    factory: async (config) => {
      const { createAzureAdapters } = await import('../azure/index.js');
      return createAzureAdapters(config);
    },
    config: {
      provider: 'azure',
      subscriptionId: 'test-subscription',
      region: 'eastus',
    },
    skip: !process.env.AZURE_CREDENTIALS,
    skipReason: 'Azure credentials not configured',
  });
});
```

4. Run the tests to validate parity

## Continuous Integration

The parity tests run in CI for every pull request:

- **Local tests**: Always run (no credentials required)
- **AWS tests**: Run if AWS credentials are available
- **GCP tests**: Run if GCP credentials are available

This ensures adapter implementations remain consistent across providers and prevents breaking changes.

## Best Practices

1. **Keep tests provider-agnostic**: Tests should not depend on provider-specific implementation details
2. **Use unique identifiers**: Generate unique IDs (UUIDs) to avoid test interference
3. **Clean up resources**: Always clean up test data in `afterAll` hooks
4. **Skip gracefully**: Use `skip` flag when credentials are unavailable
5. **Test edge cases**: Include tests for error conditions, expiration, concurrency, etc.

## Troubleshooting

### Tests failing with "INSUFFICIENT_K_ANONYMITY"

This is expected behavior when there's not enough data to meet k-anonymity requirements (k=10 by default). The test validates that adapters correctly enforce privacy guarantees.

### Tests timing out

Increase Jest timeout for cloud provider tests:

```typescript
jest.setTimeout(30000); // 30 seconds
```

### Cleanup errors

Test cleanup errors are ignored to prevent test failures due to already-deleted resources or missing permissions.

## Related Documentation

- [Adapter Types](../types.ts) - Interface definitions
- [Local Adapters](../local/README.md) - Local implementation
- [GCP Adapters](../gcp/index.ts) - GCP implementation
- [AWS Adapters](../aws/index.ts) - AWS implementation
