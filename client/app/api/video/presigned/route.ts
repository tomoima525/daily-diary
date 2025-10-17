import { NextRequest, NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
});

// videoKey is encoded in the URL, and also it's provided as a query parameter
export async function GET(request: NextRequest) {
  const videoKey = request.nextUrl.searchParams.get("videoKey");

  if (!videoKey) {
    return NextResponse.json(
      { error: "Video key is required" },
      { status: 400 }
    );
  }

  const bucketName = process.env.S3_BUCKET_NAME;
  if (!bucketName) {
    return NextResponse.json(
      { error: "S3_BUCKET_NAME not configured" },
      { status: 500 }
    );
  }

  try {
    console.log("Video key:", videoKey);
    const decodedVideoKey = decodeURIComponent(videoKey);
    console.log("Decoded video key:", decodedVideoKey);
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: decodedVideoKey,
    });

    // Generate presigned URL valid for 1 hour
    const presignedUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 3600,
    });

    return NextResponse.json({
      presignedUrl,
      expiresIn: 3600,
    });
  } catch (error) {
    console.error("Error generating presigned URL:", error);
    return NextResponse.json(
      { error: "Failed to generate presigned URL" },
      { status: 500 }
    );
  }
}
