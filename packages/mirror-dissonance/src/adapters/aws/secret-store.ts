// AWS Secret Store Adapter - wraps SSM Parameter Store operations

import {
  SSMClient,
  GetParameterCommand,
  GetParametersCommand,
} from "@aws-sdk/client-ssm";
import type { SecretStoreAdapter } from "../types";

export class AWSSecretStore implements SecretStoreAdapter {
  constructor(private readonly client: SSMClient) {}

  async getNonce(paramName: string): Promise<string> {
    const result = await this.client.send(
      new GetParameterCommand({
        Name: paramName,
        WithDecryption: true,
      })
    );

    if (!result.Parameter?.Value) {
      throw new Error(`Nonce parameter ${paramName} not found or has no value`);
    }

    return result.Parameter.Value;
  }

  async getNonceWithVersion(paramName: string): Promise<{
    value: string;
    version: number;
  }> {
    const result = await this.client.send(
      new GetParameterCommand({
        Name: paramName,
        WithDecryption: true,
      })
    );

    if (!result.Parameter?.Value) {
      throw new Error(`Nonce parameter ${paramName} not found or has no value`);
    }

    return {
      value: result.Parameter.Value,
      version: result.Parameter.Version || 1,
    };
  }

  async isReachable(): Promise<boolean> {
    try {
      // Try to list parameters to check connectivity
      // We don't need actual results, just to verify the connection works
      await this.client.send(
        new GetParametersCommand({
          Names: ["/__health_check_non_existent__"],
        })
      );
      return true;
    } catch (error: any) {
      // ParameterNotFound is actually a good sign - means we can reach SSM
      if (error.name === "ParameterNotFound") {
        return true;
      }
      // Any other error means we can't reach SSM
      console.error("SSM health check failed:", error);
      return false;
    }
  }
}
