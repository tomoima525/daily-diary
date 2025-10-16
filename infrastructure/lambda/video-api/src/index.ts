import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { v4 as uuidv4 } from "uuid";

interface PhotoMemory {
  photo_name: string;
  photo_url: string;
  feelings: string;
}

interface VideoGenerationRequest {
  photo_memories: PhotoMemory[];
}

interface VideoGenerationEvent extends VideoGenerationRequest {
  requestId: string;
}

interface ApiResponse {
  requestId: string;
  status: string;
  message: string;
}

const lambdaClient = new LambdaClient({
  region: process.env.AWS_REGION,
});

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log("Received event:", JSON.stringify(event, null, 2));

  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers,
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({
        error: "Method not allowed. Only POST requests are supported.",
      }),
    };
  }

  try {
    if (!event.body) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: "Request body is required",
        }),
      };
    }

    let requestBody: VideoGenerationRequest;
    try {
      requestBody = JSON.parse(event.body);
    } catch (error) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: "Invalid JSON in request body",
        }),
      };
    }

    if (
      !requestBody.photo_memories ||
      !Array.isArray(requestBody.photo_memories)
    ) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: "photo_memories array is required",
        }),
      };
    }

    if (requestBody.photo_memories.length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: "At least one photo memory is required",
        }),
      };
    }

    for (const memory of requestBody.photo_memories) {
      if (!memory.photo_name || !memory.photo_url || !memory.feelings) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            error:
              "Each photo memory must have photo_name, photo_url, and feelings",
          }),
        };
      }
    }

    const requestId = uuidv4();

    const videoGenerationEvent: VideoGenerationEvent = {
      ...requestBody,
      requestId,
    };

    const videoGeneratorFunctionName =
      process.env.VIDEO_GENERATOR_FUNCTION_NAME;
    if (!videoGeneratorFunctionName) {
      throw new Error(
        "VIDEO_GENERATOR_FUNCTION_NAME environment variable is not set"
      );
    }

    const invokeCommand = new InvokeCommand({
      FunctionName: videoGeneratorFunctionName,
      InvocationType: "Event",
      Payload: JSON.stringify(videoGenerationEvent),
    });

    await lambdaClient.send(invokeCommand);

    console.log(`Video generation started with requestId: ${requestId}`);

    const response: ApiResponse = {
      requestId,
      status: "processing",
      message: "Video generation started",
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error("Error processing request:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: "Internal server error",
        message:
          error instanceof Error ? error.message : "Unknown error occurred",
      }),
    };
  }
};
