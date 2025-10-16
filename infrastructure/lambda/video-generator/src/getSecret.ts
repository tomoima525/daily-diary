import {
  SecretsManagerClient,
  GetSecretValueCommandInput,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

export interface Secrets {
  GOOGLE_API_KEY: string;
}

const secretManager = new SecretsManagerClient({ region: "us-west-2" });

export const getSecret = async (SecretId: string): Promise<Secrets> => {
  const params: GetSecretValueCommandInput = {
    SecretId,
  };

  const command = new GetSecretValueCommand(params);
  const data = await secretManager.send(command);

  const value = data.SecretString;

  if (!value) {
    throw new Error("No value found in secret");
  }
  const jsonValue = JSON.parse(value!) as Secrets;

  return jsonValue;
};
