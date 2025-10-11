import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { filename } = await request.json();

    if (!filename) {
      return NextResponse.json({ error: 'Filename is required' }, { status: 400 });
    }

    // Generate unique filename with timestamp
    const timestamp = Date.now();
    const uniqueFilename = `${timestamp}-${filename}`;

    // For development/testing, return mock URLs
    // In production, this would integrate with AWS S3 SDK
    const uploadUrl = `https://daily-diary-storage-bucket.s3.us-east-1.amazonaws.com/${uniqueFilename}`;
    const fileUrl = `https://daily-diary-storage-bucket.s3.us-east-1.amazonaws.com/${uniqueFilename}`;

    return NextResponse.json({
      uploadUrl,
      fileUrl,
    });
  } catch (error) {
    console.error('Upload API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}