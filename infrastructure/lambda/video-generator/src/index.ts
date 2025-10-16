import { Handler } from "aws-lambda";
import { GoogleGenAI } from "@google/genai";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
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
}

interface VideoGenerationResponse {
  video_url: string;
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

export const handler: Handler<
  VideoGenerationEvent,
  VideoGenerationResponse
> = async (event) => {
  const { photo_memories } = event;
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

      const response = await ai.models.generateImages({
        model: "gemini-2.5-flash-image",
        prompt: `Add a caption for the photo memory. The caption should be short (max 10 words), based on the photo and feelings. Change the tone of the caption based on the feelings.
        Photo: ${memory.photo_url}
        Feelings: ${memory.feelings}`,
      });

      const imagePath = path.join(
        tempDir,
        `${memory.photo_name}_captioned.jpg`
      );

      if (
        response.generatedImages &&
        response.generatedImages[0]?.image?.imageBytes
      ) {
        const imageData = response.generatedImages[0].image.imageBytes;
        fs.writeFileSync(imagePath, Buffer.from(imageData, "base64"));
      } else {
        throw new Error(`Failed to generate image for ${memory.photo_name}`);
      }

      generatedImages.push(imagePath);
    }

    const videoPath = path.join(tempDir, "memory_video.mp4");
    await generateVideo(generatedImages, videoPath);

    const videoKey = `videos/${Date.now()}_memory_video.mp4`;
    const videoUrl = await uploadVideoToS3(videoPath, bucketName, videoKey);

    fs.rmSync(tempDir, { recursive: true, force: true });

    return {
      video_url: videoUrl,
    };
  } catch (error) {
    fs.rmSync(tempDir, { recursive: true, force: true });

    console.error("Video generation failed:", error);
    throw new Error(`Video generation failed: ${error}`);
  }
};
