import { createGcpAdapters } from './dist/src/adapters/gcp/index.js';

const config = {
  provider: 'gcp',
  projectId: process.env.GCP_PROJECT_ID || 'phasemirror-486413',
  region: process.env.GCP_REGION || 'us-central1'
};

console.log('Testing GCP connection with config:', config);

try {
  const adapters = await createGcpAdapters(config);
  console.log('✅ GCP adapters created:', Object.keys(adapters));
  
  // Test Firestore connectivity via consent store
  const hasConsent = await adapters.consentStore.hasValidConsent('test-org');
  console.log('✅ Firestore reachable, consent check returned:', hasConsent);
  
  // Test Secret Manager via nonce
  const nonce = await adapters.secretStore.getNonce();
  console.log('✅ Secret Manager reachable, nonce loaded:', nonce ? 'yes' : 'no');
  
  console.log(`
🎉 GCP infrastructure verified!`);
} catch (err) {
  console.error('❌ Error:', err.message);
  process.exit(1);
}