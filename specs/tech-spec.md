# Daily Diary Technical Specification

## Overview

Daily Diary is an AI-powered application that transforms daily stories into beautiful memory videos. Users speak about their day, upload a photo, and receive a personalized video with AI-generated captions and transitions.

## Architecture

### System Components

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Client    │────▶│   Server    │────▶│     AWS     │
│  (Next.js)  │◀────│  (Python)   │◀────│     S3      │
└─────────────┘     └─────────────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │   Gemini    │
                    │     API     │
                    └─────────────┘
```

## Implementation Tasks

### 1. Infrastructure Setup (AWS CDK TypeScript)

**Location**: `infrastructure/`

**Components**:

- S3 bucket for photo/video storage
- CORS configuration for browser uploads
- CloudFront distribution for faster access
- IAM roles and policies

**Implementation**:

```typescript
// infrastructure/lib/daily-diary-stack.ts
import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";

export class DailyDiaryStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // S3 bucket for photos and videos
    const bucket = new s3.Bucket(this, "DailyDiaryBucket", {
      bucketName: "daily-diary-storage-bucket",
      cors: [
        {
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.PUT,
            s3.HttpMethods.POST,
            s3.HttpMethods.DELETE,
          ],
          allowedOrigins: ["*"],
          allowedHeaders: ["*"],
          exposedHeaders: ["ETag"],
        },
      ],
      blockPublicAccess: {
        blockPublicAcls: false,
        blockPublicPolicy: false,
        ignorePublicAcls: false,
        restrictPublicBuckets: false,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For hackathon - use RETAIN in production
    });

    // CloudFront distribution for faster access
    const distribution = new cloudfront.Distribution(
      this,
      "DailyDiaryDistribution",
      {
        defaultBehavior: {
          origin: new origins.S3Origin(bucket),
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        },
      }
    );

    // IAM role for server to access S3
    const serverRole = new iam.Role(this, "DailyDiaryServerRole", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      inlinePolicies: {
        S3Access: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                "s3:GetObject",
                "s3:PutObject",
                "s3:DeleteObject",
                "s3:ListBucket",
              ],
              resources: [bucket.bucketArn, `${bucket.bucketArn}/*`],
            }),
          ],
        }),
      },
    });

    // Output values for use in application
    new cdk.CfnOutput(this, "BucketName", {
      value: bucket.bucketName,
      description: "S3 bucket name for Daily Diary",
    });

    new cdk.CfnOutput(this, "CloudFrontDomain", {
      value: distribution.distributionDomainName,
      description: "CloudFront distribution domain",
    });

    new cdk.CfnOutput(this, "BucketRegion", {
      value: this.region,
      description: "S3 bucket region",
    });
  }
}
```

```typescript
// infrastructure/bin/daily-diary.ts
#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { DailyDiaryStack } from '../lib/daily-diary-stack';

const app = new cdk.App();
new DailyDiaryStack(app, 'DailyDiaryStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
});
```

```json
// infrastructure/package.json
{
  "name": "daily-diary-infrastructure",
  "version": "0.1.0",
  "bin": {
    "daily-diary": "bin/daily-diary.js"
  },
  "scripts": {
    "build": "tsc",
    "watch": "tsc -w",
    "test": "jest",
    "cdk": "cdk"
  },
  "devDependencies": {
    "@types/jest": "^29.4.0",
    "@types/node": "18.14.6",
    "jest": "^29.5.0",
    "ts-jest": "^29.0.5",
    "aws-cdk": "2.87.0",
    "ts-node": "^10.9.1",
    "typescript": "~4.9.5"
  },
  "dependencies": {
    "aws-cdk-lib": "2.87.0",
    "constructs": "^10.0.0",
    "source-map-support": "^0.5.21"
  }
}
```

```json
// infrastructure/cdk.json
{
  "app": "npx ts-node --prefer-ts-exts bin/daily-diary.ts",
  "watch": {
    "include": ["**"],
    "exclude": [
      "README.md",
      "cdk*.json",
      "**/*.d.ts",
      "**/*.js",
      "tsconfig.json",
      "package*.json",
      "yarn.lock",
      "node_modules",
      "test"
    ]
  },
  "context": {
    "@aws-cdk/aws-lambda:recognizeLayerVersion": true,
    "@aws-cdk/core:checkSecretUsage": true,
    "@aws-cdk/core:target-partitions": ["aws", "aws-cn"],
    "@aws-cdk-containers/ecs-service-extensions:enableDefaultLogDriver": true,
    "@aws-cdk/aws-ec2:uniqueImdsv2TemplateName": true,
    "@aws-cdk/aws-ecs:arnFormatIncludesClusterName": true,
    "@aws-cdk/aws-iam:minimizePolicies": true,
    "@aws-cdk/core:validateSnapshotRemovalPolicy": true,
    "@aws-cdk/aws-codepipeline:crossAccountKeyAliasStackSafeResourceName": true,
    "@aws-cdk/aws-s3:createDefaultLoggingPolicy": true,
    "@aws-cdk/aws-sns-subscriptions:restrictSqsDescryption": true,
    "@aws-cdk/aws-apigateway:disableCloudWatchRole": true,
    "@aws-cdk/core:enablePartitionLiterals": true,
    "@aws-cdk/aws-events:eventsTargetQueueSameAccount": true,
    "@aws-cdk/aws-iam:standardizedServicePrincipals": true,
    "@aws-cdk/aws-ecs:disableExplicitDeploymentControllerForCircuitBreaker": true,
    "@aws-cdk/aws-iam:importedRoleStackSafeDefaultPolicyName": true,
    "@aws-cdk/aws-s3:serverAccessLogsUseBucketPolicy": true,
    "@aws-cdk/aws-route53-patters:useCertificate": true,
    "@aws-cdk/customresources:installLatestAwsSdkDefault": false,
    "@aws-cdk/aws-rds:databaseProxyUniqueResourceName": true,
    "@aws-cdk/aws-codedeploy:removeAlarmsFromDeploymentGroup": true,
    "@aws-cdk/aws-apigateway:authorizerChangeDeploymentLogicalId": true,
    "@aws-cdk/aws-ec2:launchTemplateDefaultUserData": true,
    "@aws-cdk/aws-secretsmanager:useAttachedSecretResourcePolicyForSecretTargetAttachments": true,
    "@aws-cdk/aws-redshift:columnId": true,
    "@aws-cdk/aws-stepfunctions-tasks:enableLogging": true,
    "@aws-cdk/aws-ec2:restrictDefaultSecurityGroup": true,
    "@aws-cdk/aws-apigateway:requestValidatorUniqueId": true,
    "@aws-cdk/aws-kms:aliasNameRef": true,
    "@aws-cdk/aws-autoscaling:generateLaunchTemplateInsteadOfLaunchConfig": true,
    "@aws-cdk/core:includePrefixInUniqueNameGeneration": true,
    "@aws-cdk/aws-efs:denyAnonymousAccess": true,
    "@aws-cdk/aws-opensearchservice:enableLogging": true,
    "@aws-cdk/aws-normmcached:useLogicalId": true,
    "@aws-cdk/aws-lambda:recognizeVersionProps": true,
    "@aws-cdk/aws-cloudfront:defaultSecurityPolicyTLSv1.2_2021": true,
    "@aws-cdk-lib/aws-rds:auroraClusterChangeScopeOfInstanceParameterGroupWithEachParameters": true,
    "@aws-cdk/aws-eks:nodegroupNameAttribute": true,
    "@aws-cdk/aws-ec2:ebsDefaultGp3Volume": true,
    "@aws-cdk/aws-ecs:removeDefaultDeploymentAlarm": true
  }
}
```

```typescript
// infrastructure/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": [
      "es2020"
    ],
    "declaration": true,
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noImplicitThis": true,
    "alwaysStrict": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": false,
    "inlineSourceMap": true,
    "inlineSources": true,
    "experimentalDecorators": true,
    "strictPropertyInitialization": false,
    "typeRoots": [
      "./node_modules/@types"
    ]
  },
  "exclude": [
    "node_modules",
    "cdk.out"
  ]
}
```

**Setup Commands**:

```bash
mkdir infrastructure
cd infrastructure
npm install -g aws-cdk
cdk init app --language typescript
npm install
cdk bootstrap  # First time only
cdk deploy
```

### 2. Server Updates

#### 2.1 Update Bot System Instruction

**File**: `server/bot.py`

**Changes**:

- Update `SYSTEM_INSTRUCTION` (line 79)
- Modify initial message (line 104)

```python
SYSTEM_INSTRUCTION = """
You are Daily Diary, an AI assistant that helps users create beautiful memory videos from their daily stories.

Your conversation flow:
1. Warmly greet the user and ask about their day
2. Listen to their story with empathy and interest
3. Ask them to share a photo from their day
4. When they upload a photo, analyze it and ask questions about the moment
5. Offer to create a memory video with their story and photo

Be warm, empathetic, and creative in your responses. Help users capture not just what happened, but how it felt.
"""
```

#### 2.2 Add S3 Upload Handler

**File**: `server/s3_handler.py` (new)

```python
import boto3
from typing import Dict
import os

class S3Handler:
    def __init__(self):
        self.s3_client = boto3.client('s3')
        self.bucket_name = os.getenv('S3_BUCKET_NAME')

    def generate_presigned_url(self, key: str, expiration: int = 3600) -> str:
        """Generate presigned URL for upload"""
        return self.s3_client.generate_presigned_url(
            'put_object',
            Params={'Bucket': self.bucket_name, 'Key': key},
            ExpiresIn=expiration
        )

    def get_object_url(self, key: str) -> str:
        """Get public URL for uploaded object"""
        return f"https://{self.bucket_name}.s3.amazonaws.com/{key}"
```

#### 2.3 Add Storyboard Generation

**File**: `server/storyboard.py` (new)

```python
from dataclasses import dataclass
from typing import List
import json

@dataclass
class Scene:
    caption: str
    description: str
    duration: float  # seconds

class StoryboardGenerator:
    def generate(self, transcript: str, photo_analysis: str) -> List[Scene]:
        """Generate storyboard from user's story and photo"""
        # Parse transcript to extract key moments
        # Create 3-5 scenes with captions
        scenes = [
            Scene(
                caption="Morning started with...",
                description="A peaceful morning scene",
                duration=2.0
            ),
            # ... more scenes
        ]
        return scenes
```

#### 2.4 Caption Image Generation

**File**: `server/image_generator.py` (new)

```python
import google.generativeai as genai
from PIL import Image, ImageDraw, ImageFont
import io
from typing import List

class ImageGenerator:
    def __init__(self, api_key: str):
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel('gemini-2.0-flash-experimental')

    def analyze_photo(self, photo_url: str) -> str:
        """Analyze uploaded photo using Gemini"""
        # Download image from S3
        # Analyze with Gemini vision
        response = self.model.generate_content([
            "Describe this photo in a poetic way",
            Image.open(io.BytesIO(image_data))
        ])
        return response.text

    def create_caption_frames(self, base_image_path: str, scenes: List[Scene]) -> List[str]:
        """Create frames with caption overlays"""
        frames = []
        base_image = Image.open(base_image_path)

        for scene in scenes:
            # Create copy of base image
            frame = base_image.copy()

            # Add caption overlay
            draw = ImageDraw.Draw(frame)
            font = ImageFont.truetype("arial.ttf", 40)

            # Add semi-transparent background for text
            overlay = Image.new('RGBA', frame.size, (0, 0, 0, 0))
            overlay_draw = ImageDraw.Draw(overlay)
            overlay_draw.rectangle(
                [(50, frame.height - 150), (frame.width - 50, frame.height - 50)],
                fill=(0, 0, 0, 180)
            )
            frame = Image.alpha_composite(frame.convert('RGBA'), overlay)

            # Draw caption text
            draw = ImageDraw.Draw(frame)
            draw.text(
                (frame.width // 2, frame.height - 100),
                scene.caption,
                font=font,
                fill=(255, 255, 255),
                anchor="mm"
            )

            # Save frame
            frame_path = f"/tmp/frame_{len(frames)}.png"
            frame.save(frame_path)
            frames.append(frame_path)

        return frames
```

#### 2.5 Video Generation with FFmpeg

**File**: `server/video_generator.py` (new)

```python
import subprocess
import os
from typing import List

class VideoGenerator:
    def __init__(self, s3_handler):
        self.s3_handler = s3_handler

    def create_video(self, image_paths: List[str], output_path: str) -> str:
        """Create video from images using ffmpeg"""

        # Create input file list for ffmpeg
        list_file = "/tmp/input_list.txt"
        with open(list_file, 'w') as f:
            for img_path in image_paths:
                # Each image displays for 2 seconds
                f.write(f"file '{img_path}'\n")
                f.write(f"duration 2\n")
            # Add last image again (ffmpeg requirement)
            f.write(f"file '{image_paths[-1]}'\n")

        # FFmpeg command with fade transitions
        cmd = [
            'ffmpeg',
            '-f', 'concat',
            '-safe', '0',
            '-i', list_file,
            '-vf', 'fade=t=in:st=0:d=0.5,fade=t=out:st=1.5:d=0.5',
            '-c:v', 'libx264',
            '-pix_fmt', 'yuv420p',
            '-movflags', '+faststart',
            output_path
        ]

        subprocess.run(cmd, check=True)

        # Upload to S3
        video_key = f"videos/{os.path.basename(output_path)}"
        self.s3_handler.upload_file(output_path, video_key)

        return self.s3_handler.get_object_url(video_key)
```

#### 2.6 Function Tool Integration

**File**: `server/bot.py` (update)

Add function tool for video generation:

```python
from pipecat.processors.tools import ToolProcessor, Tool

class GenerateVideoTool(Tool):
    name = "generate_video"
    description = "Generate a memory video from the conversation"

    async def execute(self, context):
        # Get user messages and photo URL
        photo_url = context.get("photo_url")
        transcript = context.get("transcript")

        # Generate storyboard
        storyboard = StoryboardGenerator().generate(transcript, photo_url)

        # Create caption frames
        frames = ImageGenerator().create_caption_frames(photo_url, storyboard)

        # Generate video
        video_url = VideoGenerator().create_video(frames)

        return {"video_url": video_url}
```

### 3. Client Updates

#### 3.1 Photo Upload Component

**File**: `client/app/components/PhotoUpload.tsx` (new)

```typescript
import { useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@pipecat-ai/voice-ui-kit";

export function PhotoUpload({ onUpload }: { onUpload: (url: string) => void }) {
  const [uploading, setUploading] = useState(false);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);

    try {
      // Get presigned URL from server
      const response = await fetch("/api/upload", {
        method: "POST",
        body: JSON.stringify({ filename: file.name }),
      });
      const { uploadUrl, fileUrl } = await response.json();

      // Upload to S3
      await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": file.type,
        },
      });

      onUpload(fileUrl);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="relative">
      <input
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
        id="photo-upload"
        disabled={uploading}
      />
      <label htmlFor="photo-upload">
        <Button as="span" disabled={uploading}>
          <Upload className="w-4 h-4 mr-2" />
          {uploading ? "Uploading..." : "Upload Photo"}
        </Button>
      </label>
    </div>
  );
}
```

#### 3.2 Video Display Component

**File**: `client/app/components/VideoDisplay.tsx` (new)

```typescript
export function VideoDisplay({ videoUrl }: { videoUrl: string | null }) {
  if (!videoUrl) return null;

  return (
    <div className="rounded-lg overflow-hidden shadow-lg">
      <video src={videoUrl} controls className="w-full" autoPlay />
    </div>
  );
}
```

#### 3.3 Update ClientApp

**File**: `client/app/ClientApp.tsx` (update)

Add photo upload and video display:

```typescript
// Add to imports
import { PhotoUpload } from './components/PhotoUpload';
import { VideoDisplay } from './components/VideoDisplay';

// Add state
const [videoUrl, setVideoUrl] = useState<string | null>(null);

// Add handler
const handlePhotoUpload = (url: string) => {
  client?.sendClientMessage('photo_uploaded', {
    type: 'photo_upload',
    url: url,
  });
};

// Add to controls area (line 194)
<PhotoUpload onUpload={handlePhotoUpload} />

// Add video display in conversation area
<VideoDisplay videoUrl={videoUrl} />
```

### 4. Environment Variables

**File**: `server/.env`

```bash
GOOGLE_API_KEY=your_gemini_api_key
S3_BUCKET_NAME=daily-diary-bucket
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
DAILY_SAMPLE_ROOM_URL=your_daily_room_url
```

**File**: `client/.env.local`

```bash
NEXT_PUBLIC_API_ENDPOINT=http://localhost:8000
```

### 5. Dependencies to Install

**Server** (`server/pyproject.toml`):

```toml
dependencies = [
    "pipecat-ai[webrtc,daily,silero,google,local-smart-turn-v3,runner]>=0.0.90",
    "pipecatcloud>=0.2.6",
    "google-generativeai>=1.43.0",
    "boto3>=1.40.0",
]
```

**Client** (`client/package.json`):

```json
{
  "dependencies": {
    "@aws-sdk/client-s3": "^3.0.0",
    "@aws-sdk/s3-request-presigner": "^3.0.0"
  }
}
```

## Testing Plan

1. **Unit Tests**:

   - S3 upload/download
   - Storyboard generation
   - Image processing
   - Video generation

2. **Integration Tests**:

   - End-to-end flow from upload to video
   - RTVI message passing
   - Error handling

3. **Manual Testing**:
   - Various photo formats
   - Different story lengths
   - Network interruptions

## Deployment

1. Deploy AWS infrastructure: `cdk deploy`
2. Deploy server to Pipecat Cloud
3. Deploy client to Vercel/Netlify
4. Configure environment variables

## Timeline

- Hour 1-2: AWS CDK setup, S3 configuration
- Hour 3-4: Server photo upload handling
- Hour 5-6: Storyboard and image generation
- Hour 7-8: Video generation with ffmpeg
- Hour 9-10: Client UI updates
- Hour 11-12: Testing and debugging

## MVP Deliverables

1. ✅ Voice conversation about daily stories
2. ✅ Photo upload to S3
3. ✅ AI-generated captions on photos
4. ✅ Video creation with transitions
5. ✅ Video playback in browser

## Future Enhancements (Post-Hackathon)

- Multiple photo support
- Background music generation
- Voice narration overlay
- User accounts and history
- Video editing capabilities
- Social sharing features
