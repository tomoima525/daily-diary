# 🎬 Daily Diary — AI That Turns Your Daily day into a beautiful memory

https://github.com/user-attachments/assets/ab60d587-cacd-4300-9851-72a9d876d86d

## What is this?

Daily Diary lets users create short daily videos just by talking.
Before bed, you tell the AI about your day — it listens, understands the story, finds related photos and videos, adds narration and music, and produces a short “memory movie.”
It captures not only what happened, but how it felt.

## How does it work?

It is an intelligent photo memory assistant that combines real-time voice conversation with visual analysis. Upload photos and engage in meaningful conversations about your memories while the AI analyzes your images and asks thoughtful questions to help you reflect on your experiences.

## Out put video

I took photos at the hackathon and made this video using Daily diary

https://github.com/user-attachments/assets/9bb700e0-71cf-4100-bad6-d76fea995db8



## How Gemini models and Pipecat used

**Gemini Integration:**
- **Gemini 2.5 gemini-2.5-flash** for real-time voice conversations via Pipecat's Gemini integration
- **Gemini 2.5 gemini-2.5-flash-image** for intelligent photo analysis, generating empathetic responses about user memories
- Custom prompts designed for emotional understanding and memory exploration

**Pipecat Integration:**
- Real-time WebRTC voice communication through Daily.co transport
- Custom pipeline handling photo uploads and analysis results
- **Voice UI Kit** components for polished user experience

## Other tools used

- **AWS S3, Lambda**: Secure photo storage with presigned URL uploads, video generation
- **Daily.co**: WebRTC infrastructure for real-time communication

## What we built new during the hackathon

## Feedback on tools used

**Gemini:**
- **Excellent**: Natural conversation flow with minimal latency
- **Great**: Easy integration with Pipecat's existing infrastructure
- **Suggestion**: More examples of custom prompt engineering for specific use cases. `Role` is different from other models (Gemini only has "Model", "User") which was a bit confusing.

**Pipecat:**
- **Loved**: Voice UI Kit components saved significant development time!
- **Challenge**: While Pipecat is super flexible and has many ways to achieve something, I often was not sure what's the best way. For instance, when handling a frame, there is `push_frame` and `queue_frame`. I wasn't quite sure what's the difference between these two functions and I wish there were a good example that illustrates the behavior.  

## Project structure

- `client/`: Next.js app with Voice UI Kit components and resizable layout
- `server/`: Python bot integrating Gemini with Pipecat


