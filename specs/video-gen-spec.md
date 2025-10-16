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

TODO for Claude Code: Implement this.

### Outputs

```json
{
  "video_url": "{S3_BUCKET_NAME}/{video_name}.mp4"
}
```
