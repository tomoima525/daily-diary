import { NextRequest, NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export async function POST(request: NextRequest) {
  try {
    const { filename, contentType } = await request.json();

    if (!filename) {
      return NextResponse.json({ error: 'Filename is required' }, { status: 400 });
    }

    // Generate unique filename with timestamp
    const timestamp = Date.now();
    const uniqueFilename = `photos/${timestamp}-${filename}`;

    // Create the S3 command for presigned URL
    const command = new PutObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME || 'daily-diary-storage-bucket',
      Key: uniqueFilename,
      ContentType: contentType || 'image/*',
    });

    // Generate presigned URL (expires in 1 hour)
    const uploadUrl = await getSignedUrl(s3Client, command, { 
      expiresIn: 3600,
      signableHeaders: new Set(['content-type'])
    });

    // Generate the file URL for accessing the uploaded file
    const fileUrl = `https://${process.env.S3_BUCKET_NAME || 'daily-diary-storage-bucket'}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${uniqueFilename}`;

    return NextResponse.json({
      uploadUrl,
      fileUrl,
      key: uniqueFilename,
    });
  } catch (error) {
    console.error('Upload API error:', error);
    return NextResponse.json({ 
      error: 'Failed to generate upload URL',
      details: process.env.NODE_ENV === 'development' ? error : undefined
    }, { status: 500 });
  }
}