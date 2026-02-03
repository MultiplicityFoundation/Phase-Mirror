/**
 * Factory for creating adapter instances based on configuration
 */

import { Adapters, AdapterConfig } from './types.js';
import { DynamoDBFPStore, DynamoDBConsentStore, DynamoDBBlockCounter, SSMSecretStore } from './aws/index.js';
import { NoOpFPStore, NoOpConsentStore, InMemoryBlockCounter, InMemorySecretStore } from './local/index.js';

/**
 * Create adapter bundle based on configuration
 * Defaults to 'local' mode if no cloud provider specified
 */
export function createAdapters(config?: AdapterConfig): Adapters {
  const cloudProvider = config?.cloudProvider || 'local';

  if (cloudProvider === 'aws') {
    return {
      fpStore: config?.fpTableName 
        ? new DynamoDBFPStore({ 
            tableName: config.fpTableName, 
            region: config.region 
          })
        : new NoOpFPStore(),
      
      consentStore: config?.consentTableName
        ? new DynamoDBConsentStore({
            tableName: config.consentTableName,
            region: config.region,
            endpoint: config.endpoint,
          })
        : new NoOpConsentStore(),
      
      blockCounter: config?.blockCounterTableName
        ? new DynamoDBBlockCounter({
            tableName: config.blockCounterTableName,
            region: config.region,
            endpoint: config.endpoint,
          })
        : new InMemoryBlockCounter(),
      
      secretStore: new SSMSecretStore({ region: config?.region }),
    };
  }

  // Default to local/test implementations
  return {
    fpStore: new NoOpFPStore(),
    consentStore: new NoOpConsentStore(),
    blockCounter: new InMemoryBlockCounter(),
    secretStore: new InMemorySecretStore(),
  };
}
