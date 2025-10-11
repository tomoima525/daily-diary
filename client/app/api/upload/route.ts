import { NextRequest, NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    ...(process.env.AWS_SESSION_TOKEN && { sessionToken: process.env.AWS_SESSION_TOKEN }),
  },
});

export async function POST(request: NextRequest) {
  try {
    const { filename, contentType } = await request.json();

    if (!filename) {
      return NextResponse.json({ error: 'Filename is required' }, { status: 400 });
    }

    // Log configuration for debugging
    console.log('S3 Configuration:', {
      region: process.env.AWS_REGION,
      bucket: process.env.S3_BUCKET_NAME,
      hasAccessKey: !!process.env.AWS_ACCESS_KEY_ID,
      hasSecretKey: !!process.env.AWS_SECRET_ACCESS_KEY,
      hasSessionToken: !!process.env.AWS_SESSION_TOKEN,
    });

    // Generate unique filename with timestamp
    const timestamp = Date.now();
    const uniqueFilename = `photos/${timestamp}-${filename}`;

    const bucketName = process.env.S3_BUCKET_NAME || 'daily-diary-storage-bucket';
    const region = process.env.AWS_REGION || 'us-east-1';

    // Create the S3 command for presigned URL
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: uniqueFilename,
      ContentType: contentType || 'image/*',
    });

    // Generate presigned URL (expires in 1 hour)
    const uploadUrl = await getSignedUrl(s3Client, command, { 
      expiresIn: 3600,
      signableHeaders: new Set(['content-type'])
    });

    // Generate the file URL for accessing the uploaded file
    const fileUrl = `https://${bucketName}.s3.${region}.amazonaws.com/${uniqueFilename}`;

    console.log('Generated presigned URL successfully for:', uniqueFilename);

    return NextResponse.json({
      uploadUrl,
      fileUrl,
      key: uniqueFilename,
      debug: process.env.NODE_ENV === 'development' ? { region, bucket: bucketName } : undefined,
    });
  } catch (error) {
    console.error('Upload API error:', error);
    return NextResponse.json({ 
      error: 'Failed to generate upload URL',
      details: process.env.NODE_ENV === 'development' ? String(error) : undefined
    }, { status: 500 });
  }
}