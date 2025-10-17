import { NextRequest, NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ videoKey: string }> }
) {
  const { videoKey } = await params;
  
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
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: videoKey,
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