/**
 * Consent Store Configuration
 *
 * @deprecated The ConsentStore (DynamoDB-backed) class that lived here has
 *   moved to `src/adapters/aws/consent-store.ts`.  Use the adapter factory.
 *
 * Only the ConsentStoreConfig type remains for backward compatibility.
 */

export interface ConsentStoreConfig {
  tableName: string;
  region: string;
  cacheTTLSeconds?: number;
}
