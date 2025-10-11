# 🎬 Daily Diary — AI That Turns Your Daily day into a beutiful memory

## 1. Concept

Daily Diary lets users create short daily videos just by talking.
Before bed, you tell the AI about your day — it listens, understands the story, finds related photos and videos, adds narration and music, and produces a short “memory movie.”
It captures not only what happened, but how it felt.

## 2. Problem

For busy parents (like me), days move too fast.
I take pictures and videos of my kids, but rarely have time to organize or edit them.
Those small, emotional moments fade away in photo folders.
I wanted a simple way to preserve those memories — not just visually, but emotionally.

## 3. Solution

Just speak to the AI each night.

“I’m tired but happy — we went to the beach and watched the sunset.”

Voice Diary will:

- Transcribe and summarize your story
- Create a captions for the photo that you uploaded
- Generate a short film with voice narration, captions, and music

The next morning, your day becomes a beautiful highlight video.

## 4. How It Works (Flow Overview)

| Step | Description           | Key Tech                                        |
| ---- | --------------------- | ----------------------------------------------- |
| 1️⃣   | Audio to Text         | Convert your spoken story to text               |
| 2️⃣   | Media Selection       | Upload the photo and review from screen sharing |
| 3️⃣   | Story Understanding   | Summarize what user felt about the photo        |
| 4️⃣   | Storyboard Generation | Create scene order, captions, transitions       |
| 5️⃣   | Video Rendering       | Generate clips and merge them into one          |
| 7️⃣   | Output                | Save final MP4 to S3 or R2                      |

## 5. Core Components

### 🗣 Multimodal Voice Agent

- Voice Agent to understand the user's story and photo
- Pipecat Voice UI Kit and Gemini Live Multimodal model.
- Photo will be upload by user to S3 bucket. The key will be passed to the bot using RTVI events.
- Voice Agent will ask user about the photo.

### 🗣 Storyboard Generation

- When a user asks to create a short video, start storyboard generation using the function tool calling to trigger the storyboard generation.
- Based on the transcript and photo url, generate a storyboard.

### 🗣 Caption Generation

- Using the storyboard, generate a caption for each scene.
- Caption Generation is done by Gemini image generation model using their SDK.
- Store generated image in S3 bucket.

### 🗣 Video Rendering

- Using the generated images, generate a video.
- Video Rendering is done by ffmpeg.
- Output Save final MP4 to S3
- Once the video is generated, send the video url to the user.
