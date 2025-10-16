# Video Processing Feature Specification

## Overview

Add video generation capability to the Daily Diary application that creates personalized memory videos from user photos and conversation transcripts using AI-generated captions.

## Feature Requirements

Implement a lambda function that generates a video from a photo and a conversation transcript.

### Core Functionality

1. **Generate AI Captions** - Use Gemini to create contextual, emotional captions based on photo and conversation and overlay on the photo.
2. **Assemble Video** - Use FFmpeg to create smooth video with transitions
3. **Store & Serve** - Upload video to S3 and provide playable URL to client

## Technical Implementation

### Lambda Function

- Generate lambda function and a lambda layer for ffmpeg using CDK.
- ffmpeg layer should be uploaded to S3 and used in the lambda function.
- Lambda function build with TypeScript using `aws_lambda_nodejs` in `aws_cdk_lib`.

### Inputs

```json
{
  "photo_memories": [
    {
      "photo_name": "image_0",
      "photo_url": "{S3_BUCKET_NAME}/{photo_name}.jpg",
      "feelings": "I had a great lunch with my friends"
    },
    {
      "photo_name": "image_1",
      "photo_url": "{S3_BUCKET_NAME}/{photo_name}.jpg",
      "feelings": "This ramen was delicious"
    }
    ...
  ]
}
```

### Generate AI Captions for each photo memory

- Use Gemini Image Generation() to generate a caption for each photo memory.
- Follow the example in the document: https://ai.google.dev/gemini-api/docs/imagen

- Generate image for each photo memory using Gemini Image Generation.

```typescript
import { GoogleGenAI } from "@google/genai";
const ai = new GoogleGenAI({
  apiKey: process.env.GOOGLE_API_KEY,
});
async function generateImage(photo_url: string, feelings: string) {
   const response = await ai.models.generateImages({
    model: 'gemini-2.5-flash-image',
    prompt: `Add a caption for the photo memory. The caption should be short(max 10 words), based on the photo and feelings. Change the tone of the caption based on the feelings.
    Photo: ${photo_url}
    Feelings: ${feelings}`,
  });
```

- Store generated images in a temporary directory.

### FFmpeg Video Generation

- Generate MP4 video from the generated images using FFmpeg.
- Connect the generated images in the order of photo_name
- Add fade transition between each image.
- Store video in S3 bucket.

```typescript
import { execSync } from "child_process";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import * as fs from "fs";
import * as path from "path";

async function generateVideo(generatedImages: string[], outputPath: string) {
  // Create FFmpeg command for video generation with fade transitions
  const fadeInDuration = 0.5;
  const fadeOutDuration = 0.5;
  const imageDuration = 3; // seconds per image

  // Build filter complex for fade transitions
  const filterParts = [];
  const inputParts = [];

  generatedImages.forEach((imagePath, index) => {
    inputParts.push(`-loop 1 -t ${imageDuration} -i ${imagePath}`);

    if (index === 0) {
      // First image: only fade out
      filterParts.push(
        `[${index}:v]fade=t=out:st=${
          imageDuration - fadeOutDuration
        }:d=${fadeOutDuration}[v${index}]`
      );
    } else if (index === generatedImages.length - 1) {
      // Last image: only fade in
      filterParts.push(
        `[${index}:v]fade=t=in:st=0:d=${fadeInDuration}[v${index}]`
      );
    } else {
      // Middle images: fade in and out
      filterParts.push(
        `[${index}:v]fade=t=in:st=0:d=${fadeInDuration},fade=t=out:st=${
          imageDuration - fadeOutDuration
        }:d=${fadeOutDuration}[v${index}]`
      );
    }
  });

  // Concatenate all video segments
  const concatInputs = generatedImages
    .map((_, index) => `[v${index}]`)
    .join("");
  filterParts.push(
    `${concatInputs}concat=n=${generatedImages.length}:v=1:a=0[out]`
  );

  const ffmpegCommand = [
    "ffmpeg",
    ...inputParts,
    "-filter_complex",
    `"${filterParts.join(";")}"`,
    '-map "[out]"',
    "-c:v libx264",
    "-r 30",
    "-pix_fmt yuv420p",
    outputPath,
  ].join(" ");

  try {
    execSync(ffmpegCommand, { stdio: "inherit" });
    console.log(`Video generated successfully: ${outputPath}`);
  } catch (error) {
    console.error("FFmpeg error:", error);
    throw new Error(`Video generation failed: ${error}`);
  }
}

async function uploadVideoToS3(
  videoPath: string,
  bucketName: string,
  key: string
) {
  const s3Client = new S3Client({});
  const videoBuffer = fs.readFileSync(videoPath);

  const uploadParams = {
    Bucket: bucketName,
    Key: key,
    Body: videoBuffer,
    ContentType: "video/mp4",
  };

  try {
    const result = await s3Client.send(new PutObjectCommand(uploadParams));
    console.log(`Video uploaded to S3: ${bucketName}/${key}`);
    return `https://${bucketName}.s3.amazonaws.com/${key}`;
  } catch (error) {
    console.error("S3 upload error:", error);
    throw new Error(`Failed to upload video to S3: ${error}`);
  }
}
```

### Complete Lambda Function Implementation

```typescript
import { Handler } from "aws-lambda";
import { GoogleGenAI } from "@google/genai";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

interface PhotoMemory {
  photo_name: string;
  photo_url: string;
  feelings: string;
}

interface VideoGenerationEvent {
  photo_memories: PhotoMemory[];
}

interface VideoGenerationResponse {
  video_url: string;
}

export const handler: Handler<
  VideoGenerationEvent,
  VideoGenerationResponse
> = async (event) => {
  const { photo_memories } = event;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "video-gen-"));
  const bucketName = process.env.S3_BUCKET_NAME!;

  try {
    // Initialize Google AI
    const ai = new GoogleGenAI({
      apiKey: process.env.GOOGLE_API_KEY!,
    });

    // Generate captioned images for each photo memory
    const generatedImages: string[] = [];

    for (let i = 0; i < photo_memories.length; i++) {
      const memory = photo_memories[i];

      // Generate captioned image using Gemini
      const response = await ai.models.generateImages({
        model: "gemini-2.5-flash-image",
        prompt: `Add a caption for the photo memory. The caption should be short (max 10 words), based on the photo and feelings. Change the tone of the caption based on the feelings.
        Photo: ${memory.photo_url}
        Feelings: ${memory.feelings}`,
      });

      // Save generated image to temporary directory
      const imagePath = path.join(
        tempDir,
        `${memory.photo_name}_captioned.jpg`
      );
      // Assuming response contains image data that needs to be saved
      // Implementation depends on actual Gemini API response format
      fs.writeFileSync(imagePath, response.imageData);
      generatedImages.push(imagePath);
    }

    // Generate video using FFmpeg
    const videoPath = path.join(tempDir, "memory_video.mp4");
    await generateVideo(generatedImages, videoPath);

    // Upload video to S3
    const videoKey = `videos/${Date.now()}_memory_video.mp4`;
    const videoUrl = await uploadVideoToS3(videoPath, bucketName, videoKey);

    // Cleanup temporary files
    fs.rmSync(tempDir, { recursive: true, force: true });

    return {
      video_url: videoUrl,
    };
  } catch (error) {
    // Cleanup temporary files on error
    fs.rmSync(tempDir, { recursive: true, force: true });

    console.error("Video generation failed:", error);
    throw new Error(`Video generation failed: ${error}`);
  }
};
```

### CDK Infrastructure Requirements

- Lambda function with 15-minute timeout and 10GB memory for video processing
- FFmpeg layer with amd64 architecture
- S3 bucket with public read access for video serving
- Environment variables: `GOOGLE_API_KEY`, `S3_BUCKET_NAME`
- IAM permissions for S3 read/write operations

### Outputs

```json
{
  "video_url": "{S3_BUCKET_NAME}/{video_name}.mp4"
}
```
