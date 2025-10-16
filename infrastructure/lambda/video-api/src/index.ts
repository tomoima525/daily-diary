import { APIGatewayProxyEvent, APIGatewayProxyResult, APIGatewayProxyEventV2 } from "aws-lambda";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { S3Client, HeadObjectCommand } from "@aws-sdk/client-s3";
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

interface VideoStatusResponse {
  isReady: boolean;
  videoKey?: string;
}

const lambdaClient = new LambdaClient({
  region: process.env.AWS_REGION,
});

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
});

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

async function checkVideoStatus(requestId: string): Promise<VideoStatusResponse> {
  const bucketName = process.env.S3_BUCKET_NAME;
  if (!bucketName) {
    throw new Error("S3_BUCKET_NAME environment variable is not set");
  }

  const videoKey = `videos/vid_${requestId}.mp4`;
  
  try {
    await s3Client.send(new HeadObjectCommand({
      Bucket: bucketName,
      Key: videoKey,
    }));
    
    return {
      isReady: true,
      videoKey,
    };
  } catch (error: any) {
    if (error.name === "NotFound" || error.$metadata?.httpStatusCode === 404) {
      return {
        isReady: false,
      };
    }
    throw error;
  }
}

export const handler = async (
  event: APIGatewayProxyEvent | APIGatewayProxyEventV2
): Promise<APIGatewayProxyResult> => {
  console.log("Received event:", JSON.stringify(event, null, 2));

  // Handle both API Gateway v1 and v2 (Function URL) events
  const httpMethod = 'httpMethod' in event ? event.httpMethod : event.requestContext?.http?.method;
  const path = 'path' in event ? event.path : event.requestContext?.http?.path || event.rawPath || '/';
  const body = event.body;

  if (httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers,
      body: "",
    };
  }

  // Handle GET requests for video status
  if (httpMethod === "GET") {
    const pathMatch = path.match(/^\/video\/([a-f0-9-]+)$/i);
    if (!pathMatch) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: "Invalid path. Use /video/{requestId}",
        }),
      };
    }

    const requestId = pathMatch[1];
    
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(requestId)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: "Invalid request ID format",
        }),
      };
    }

    try {
      const statusResponse = await checkVideoStatus(requestId);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(statusResponse),
      };
    } catch (error) {
      console.error("Error checking video status:", error);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({
          error: "Internal server error",
          message: error instanceof Error ? error.message : "Unknown error occurred",
        }),
      };
    }
  }

  if (httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({
        error: "Method not allowed. Only GET and POST requests are supported.",
      }),
    };
  }

  try {
    if (!body) {
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
      requestBody = JSON.parse(body);
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
