/**
 * Integration Example: Nonce Binding Service with False Positive Submission
 * 
 * This example demonstrates the complete flow from identity verification
 * to nonce binding to false positive submission validation.
 */

import { NonceBindingService } from '../identity/nonce-binding.js';
import { createLocalTrustAdapters } from '../adapters/local/index.js';
import { OrganizationIdentity } from '../identity/types.js';

/**
 * Example: Complete Flow for a New Organization
 */
async function completeOrganizationOnboarding() {
  console.log('=== Phase Mirror Nonce Binding Integration Example ===\n');

  // 1. Setup services
  const adapters = createLocalTrustAdapters('.example-data');
  const nonceBindingService = new NonceBindingService(adapters.identityStore);

  console.log('✅ Services initialized\n');

  // 2. Organization completes identity verification (GitHub or Stripe)
  console.log('Step 1: Identity Verification');
  console.log('Organization "Acme Corp" verifies via GitHub...');

  const identity: OrganizationIdentity = {
    orgId: 'acme-corp',
    publicKey: 'pubkey-acme-2024',
    verificationMethod: 'github_org',
    verifiedAt: new Date(),
    uniqueNonce: '', // Will be populated by nonce binding
    githubOrgId: 123456,
  };

  await adapters.identityStore.storeIdentity(identity);
  console.log('✅ Identity verified and stored\n');

  // 3. Generate and bind nonce
  console.log('Step 2: Nonce Generation and Binding');
  const bindingResult = await nonceBindingService.generateAndBindNonce(
    'acme-corp',
    'pubkey-acme-2024'
  );

  console.log(`✅ Nonce generated: ${bindingResult.binding.nonce}`);
  console.log(`   Signature: ${bindingResult.binding.signature.substring(0, 16)}...`);
  console.log(`   Issued: ${bindingResult.binding.issuedAt.toISOString()}\n`);

  // 4. Organization submits false positive data
  console.log('Step 3: False Positive Submission');
  const fpSubmission = {
    orgId: 'acme-corp',
    nonce: bindingResult.binding.nonce,
    ruleId: 'RULE-001',
    findingId: 'FINDING-123',
    isFalsePositive: true,
    timestamp: new Date().toISOString(),
  };

  console.log(`Submitting FP for rule: ${fpSubmission.ruleId}`);

  // 5. FP Store validates nonce before accepting submission
  console.log('\nStep 4: Nonce Validation');
  const verification = await nonceBindingService.verifyBinding(
    fpSubmission.nonce,
    fpSubmission.orgId
  );

  if (!verification.valid) {
    console.error(`❌ Nonce verification failed: ${verification.reason}`);
    throw new Error('Invalid nonce');
  }

  console.log('✅ Nonce verified successfully');
  console.log(`   Org ID: ${verification.binding!.orgId}`);
  console.log(`   Usage count: ${verification.binding!.usageCount}`);

  // 6. Process FP submission (would go to FP store)
  console.log('\n✅ False positive accepted and stored');

  // 7. Increment usage count
  await nonceBindingService.incrementUsageCount(
    fpSubmission.nonce,
    fpSubmission.orgId
  );
  console.log('✅ Usage count incremented\n');

  // 8. Later: Quarterly nonce rotation
  console.log('Step 5: Scheduled Nonce Rotation (3 months later)');
  const rotationResult = await nonceBindingService.rotateNonce(
    'acme-corp',
    'pubkey-acme-2024', // Same key, just rotating nonce
    'Q2 2024 scheduled rotation'
  );

  console.log(`✅ Nonce rotated`);
  console.log(`   Old nonce (revoked): ${rotationResult.previousBinding!.nonce.substring(0, 16)}...`);
  console.log(`   New nonce (active): ${rotationResult.binding.nonce.substring(0, 16)}...`);

  // 9. View rotation history
  console.log('\nStep 6: Rotation History');
  const history = await nonceBindingService.getRotationHistory('acme-corp');
  console.log(`Nonce rotation history (${history.length} entries):`);
  history.forEach((binding, i) => {
    const status = binding.revoked ? '(revoked)' : '(active)';
    console.log(`  ${i + 1}. ${binding.nonce.substring(0, 16)}... ${status}`);
    console.log(`     Issued: ${binding.issuedAt.toISOString()}`);
    if (binding.revokedAt) {
      console.log(`     Revoked: ${binding.revokedAt.toISOString()}`);
    }
  });

  console.log('\n=== Integration Example Complete ===');
}

/**
 * Example: Handling Security Violations
 */
async function handleSecurityViolation() {
  console.log('\n=== Security Violation Handling Example ===\n');

  const adapters = createLocalTrustAdapters('.example-data-security');
  const nonceBindingService = new NonceBindingService(adapters.identityStore);

  // Setup: Create organization with nonce
  const identity: OrganizationIdentity = {
    orgId: 'suspicious-org',
    publicKey: 'pubkey-suspicious',
    verificationMethod: 'stripe_customer',
    verifiedAt: new Date(),
    uniqueNonce: '',
    stripeCustomerId: 'cus_suspicious123',
  };

  await adapters.identityStore.storeIdentity(identity);
  const bindingResult = await nonceBindingService.generateAndBindNonce(
    'suspicious-org',
    'pubkey-suspicious'
  );

  console.log('Organization setup complete');
  console.log(`Nonce: ${bindingResult.binding.nonce.substring(0, 16)}...\n`);

  // Detect suspicious activity
  console.log('⚠️  Suspicious activity detected:');
  console.log('   - Multiple IPs submitting with same nonce');
  console.log('   - Inconsistent FP patterns');
  console.log('   - Attempted rate limit bypass\n');

  // Revoke nonce
  console.log('Step 1: Revoking nonce');
  await nonceBindingService.revokeBinding(
    'suspicious-org',
    'Security violation: Attempted rate limit bypass and suspicious FP patterns'
  );
  console.log('✅ Nonce revoked\n');

  // Subsequent submission attempts fail
  console.log('Step 2: Attempting FP submission with revoked nonce');
  const verification = await nonceBindingService.verifyBinding(
    bindingResult.binding.nonce,
    'suspicious-org'
  );

  console.log(`❌ Verification failed: ${verification.reason}`);
  console.log('✅ Security violation prevented\n');

  console.log('=== Security Example Complete ===');
}

/**
 * Example: Preventing Sybil Attacks
 */
async function preventSybilAttack() {
  console.log('\n=== Sybil Attack Prevention Example ===\n');

  const adapters = createLocalTrustAdapters('.example-data-sybil');
  const nonceBindingService = new NonceBindingService(adapters.identityStore);

  // Setup verified organization
  const identity: OrganizationIdentity = {
    orgId: 'legit-org',
    publicKey: 'pubkey-legit',
    verificationMethod: 'github_org',
    verifiedAt: new Date(),
    uniqueNonce: '',
    githubOrgId: 789012,
  };

  await adapters.identityStore.storeIdentity(identity);

  // First nonce generation succeeds
  console.log('Step 1: First nonce generation (legitimate)');
  const result1 = await nonceBindingService.generateAndBindNonce(
    'legit-org',
    'pubkey-legit'
  );
  console.log(`✅ Nonce generated: ${result1.binding.nonce.substring(0, 16)}...\n`);

  // Attempt to get second nonce (Sybil attack)
  console.log('Step 2: Attempting to generate second nonce (Sybil attack)');
  try {
    await nonceBindingService.generateAndBindNonce('legit-org', 'pubkey-legit');
    console.log('❌ Should have been rejected!');
  } catch (error: any) {
    console.log(`✅ Attack prevented: ${error.message}\n`);
  }

  console.log('Enforcement:');
  console.log('  - One verified identity = One active nonce');
  console.log('  - Cannot claim multiple nonces');
  console.log('  - Must use rotateNonce() for legitimate rotation\n');

  console.log('=== Sybil Prevention Example Complete ===');
}

/**
 * Run all examples
 */
async function runExamples() {
  try {
    await completeOrganizationOnboarding();
    await handleSecurityViolation();
    await preventSybilAttack();

    console.log('\n✅ All integration examples completed successfully');
  } catch (error) {
    console.error('\n❌ Error running examples:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runExamples();
}

export {
  completeOrganizationOnboarding,
  handleSecurityViolation,
  preventSybilAttack,
};
