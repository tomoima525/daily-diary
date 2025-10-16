import { Handler } from "aws-lambda";
import { GoogleGenAI } from "@google/genai";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { getSecret } from "./getSecret";

interface PhotoMemory {
  photo_name: string;
  photo_url: string;
  feelings: string;
}

interface VideoGenerationEvent {
  photo_memories: PhotoMemory[];
  requestId?: string;
}

interface VideoGenerationResponse {
  video_url: string;
  requestId?: string;
}

async function generateVideo(generatedImages: string[], outputPath: string) {
  const fadeInDuration = 0.5;
  const fadeOutDuration = 0.5;
  const imageDuration = 3;

  const filterParts: string[] = [];
  const inputParts: string[] = [];

  generatedImages.forEach((imagePath, index) => {
    inputParts.push(`-loop 1 -t ${imageDuration} -i ${imagePath}`);

    if (index === 0) {
      filterParts.push(
        `[${index}:v]fade=t=out:st=${
          imageDuration - fadeOutDuration
        }:d=${fadeOutDuration}[v${index}]`
      );
    } else if (index === generatedImages.length - 1) {
      filterParts.push(
        `[${index}:v]fade=t=in:st=0:d=${fadeInDuration}[v${index}]`
      );
    } else {
      filterParts.push(
        `[${index}:v]fade=t=in:st=0:d=${fadeInDuration},fade=t=out:st=${
          imageDuration - fadeOutDuration
        }:d=${fadeOutDuration}[v${index}]`
      );
    }
  });

  const concatInputs = generatedImages
    .map((_, index) => `[v${index}]`)
    .join("");
  filterParts.push(
    `${concatInputs}concat=n=${generatedImages.length}:v=1:a=0[out]`
  );

  const ffmpegCommand = [
    "/opt/bin/ffmpeg",
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

async function downloadImageFromS3(
  bucketName: string,
  key: string,
  outputPath: string
): Promise<void> {
  const s3Client = new S3Client({});

  try {
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: bucketName,
        Key: key,
      })
    );

    if (!response.Body) {
      throw new Error("No image data received from S3");
    }

    const chunks: Uint8Array[] = [];
    const stream = response.Body as any;

    for await (const chunk of stream) {
      chunks.push(chunk);
    }

    const buffer = Buffer.concat(chunks);
    fs.writeFileSync(outputPath, buffer);
  } catch (error) {
    console.error(`Error downloading image from S3: ${error}`);
    throw new Error(`Failed to download image: ${error}`);
  }
}

export const handler: Handler<
  VideoGenerationEvent,
  VideoGenerationResponse
> = async (event) => {
  const { photo_memories, requestId } = event;
  
  console.log(`Starting video generation with requestId: ${requestId || 'N/A'}`);
  console.log(`Processing ${photo_memories.length} photo memories`);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "video-gen-"));
  const bucketName = process.env.S3_BUCKET_NAME!;
  const secretId = process.env.DAILY_DIARY_SECRET_ID!;
  const secrets = await getSecret(secretId);
  try {
    const ai = new GoogleGenAI({
      apiKey: secrets.GOOGLE_API_KEY,
    });

    const generatedImages: string[] = [];

    for (let i = 0; i < photo_memories.length; i++) {
      const memory = photo_memories[i];

      // Download original image from S3
      const originalImagePath = path.join(
        tempDir,
        `${memory.photo_name}_original.jpg`
      );
      await downloadImageFromS3(
        bucketName,
        memory.photo_url,
        originalImagePath
      );

      // Read the original image as base64
      const originalImageBuffer = fs.readFileSync(originalImagePath);
      const originalImageBase64 = originalImageBuffer.toString("base64");

      const prompt = [
        {
          text: `Create an enhanced version of the provided image with a stylish text overlay caption. The caption should read a short phrase (max 12 words) that captures this feeling: "${memory.feelings}". Set Good contrast, and position the text beautifully on the image. Maintain the original photo's composition and lighting.`,
        },
        {
          inlineData: {
            mimeType: "image/jpeg",
            data: originalImageBase64,
          },
        },
      ];
      // Use Gemini to generate a new image with caption overlay
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-image",
        contents: prompt,
      });

      const imagePath = path.join(
        tempDir,
        `${memory.photo_name}_captioned.jpg`
      );

      for (const part of response.candidates?.[0]?.content?.parts ?? []) {
        if (part.inlineData?.data) {
          const imageData = part.inlineData.data;
          fs.writeFileSync(imagePath, Buffer.from(imageData, "base64"));
          generatedImages.push(imagePath);
        }
      }
    }
    const videoPath = path.join(tempDir, "memory_video.mp4");
    await generateVideo(generatedImages, videoPath);
    const videoKey = `videos/vid_${requestId}.mp4`;
    const videoUrl = await uploadVideoToS3(videoPath, bucketName, videoKey);
    fs.rmSync(tempDir, { recursive: true, force: true });

    console.log(`Video generation completed successfully with requestId: ${requestId || 'N/A'}`);
    console.log(`Video URL: ${videoUrl}`);

    return {
      video_url: videoUrl,
      requestId,
    };
  } catch (error) {
    fs.rmSync(tempDir, { recursive: true, force: true });

    console.error("Video generation failed:", error);
    throw new Error(`Video generation failed: ${error}`);
  }
};
