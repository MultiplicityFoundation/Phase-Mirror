// AWS Secret Store Adapter
// Implements SecretStoreAdapter using AWS Systems Manager Parameter Store

import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import type { SecretStoreAdapter } from "../types.blueprint";

export class AWSSecretStore implements SecretStoreAdapter {
  constructor(private readonly client: SSMClient) {}

  async getNonce(paramName: string): Promise<string> {
    const result = await this.client.send(
      new GetParameterCommand({
        Name: paramName,
        WithDecryption: true,
      })
    );

    if (!result.Parameter || !result.Parameter.Value) {
      throw new Error(`Nonce parameter ${paramName} not found or empty`);
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

    if (!result.Parameter || !result.Parameter.Value) {
      throw new Error(`Nonce parameter ${paramName} not found or empty`);
    }

    return {
      value: result.Parameter.Value,
      version: result.Parameter.Version || 1,
    };
  }

  async isReachable(): Promise<boolean> {
    try {
      // Try to list a parameter that may or may not exist
      // If SSM is reachable, it will return (even if parameter doesn't exist)
      await this.client.send(
        new GetParameterCommand({
          Name: "/health-check-dummy",
          WithDecryption: false,
        })
      );
      return true;
    } catch (error: any) {
      // ParameterNotFound is actually a success - SSM is reachable
      if (error.name === "ParameterNotFound") {
        return true;
      }
      // Any other error means SSM is not reachable
      return false;
    }
  }
}
