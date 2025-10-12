# Video Processing Feature Specification

## Overview

Add video generation capability to the Daily Diary application that creates personalized memory videos from user photos and conversation transcripts using AI-generated captions.

## Current Implementation Status

### Existing Components ✅
- **S3 Photo Management** (`server/s3_manager.py`) - Download/upload images from S3
- **Image Analysis** (`server/image_analyzer.py`) - Gemini-powered photo analysis
- **Bot Integration** (`server/bot.py`) - Handles photo uploads and user interactions
- **AWS Infrastructure** - S3 bucket and CloudFront setup

### System Dependencies ✅
- FFmpeg installed at `/opt/homebrew/bin/ffmpeg`
- Pillow (PIL) for image processing
- google-generativeai package for AI caption generation
- boto3 for S3 operations

## Feature Requirements

### Core Functionality
1. **Generate AI Captions** - Use Gemini to create contextual, emotional captions based on photo and conversation
2. **Create Video Frames** - Overlay captions on user's photo with attractive styling
3. **Assemble Video** - Use FFmpeg to create smooth video with transitions
4. **Store & Serve** - Upload video to S3 and provide playable URL to client

### User Flow
1. User uploads photo and shares their story via voice conversation
2. Bot analyzes photo and engages in empathetic conversation
3. User requests memory video creation (e.g., "Create my memory video")
4. System generates video with 3-5 scenes featuring:
   - User's original photo as background
   - AI-generated captions that tell their story
   - Smooth transitions between scenes
5. Bot returns video URL for immediate playback

## Technical Implementation

### New Components to Build

#### 1. Storyboard Generator (`server/storyboard.py`)
```python
@dataclass
class Scene:
    caption: str
    duration: float  # seconds
    emotional_tone: str

class StoryboardGenerator:
    def generate_from_conversation(self, transcript: str, photo_analysis: str) -> List[Scene]
```

**Responsibilities:**
- Parse conversation transcript to extract key emotional moments
- Create 3-5 scenes with appropriate timing (2-3 seconds each)
- Structure narrative arc for compelling video flow

#### 2. Caption Generator (`server/caption_generator.py`)
```python
class CaptionGenerator:
    def generate_scene_captions(self, image: Image, transcript: str, scene_count: int) -> List[str]
```

**Responsibilities:**
- Use `google.generativeai` (existing package) for caption generation
- Analyze photo content and conversation context
- Generate personalized, poetic captions for each scene
- Ensure captions are concise (max 10 words) and emotionally resonant

**Gemini Prompt Strategy:**
```python
prompt = f"""
Based on this conversation about someone's day: {transcript}
And this photo showing: {photo_analysis}

Generate {scene_count} short, poetic captions (max 10 words each) that:
1. Tell the emotional story of this moment
2. Progress from the specific moment to universal feelings
3. Use warm, empathetic language
4. Capture the essence of this memory

Return only the captions, one per line.
"""
```

#### 3. Frame Creator (`server/frame_creator.py`)
```python
class FrameCreator:
    def create_captioned_frames(self, base_image: Image, captions: List[str]) -> List[str]
```

**Responsibilities:**
- Load user's photo from S3 using existing `s3_manager.py`
- Apply visual styling (semi-transparent overlay, elegant typography)
- Create multiple frames with progressive captions
- Save frames as temporary files for FFmpeg processing

**Visual Design:**
- Semi-transparent dark overlay at bottom third of image
- White text with drop shadow for readability
- Elegant font (system fonts: Arial/Helvetica)
- Consistent positioning and sizing

#### 4. Video Generator (`server/video_generator.py`)
```python
class VideoGenerator:
    def create_memory_video(self, frame_paths: List[str], output_path: str) -> str
```

**Responsibilities:**
- Use FFmpeg to assemble frames into MP4 video
- Add fade-in/fade-out transitions between scenes
- Configure web-compatible encoding (H.264, yuv420p)
- Upload final video to S3 and return presigned URL

**FFmpeg Configuration:**
```bash
ffmpeg -f concat -safe 0 -i input_list.txt \
  -vf "fade=t=in:st=0:d=0.5,fade=t=out:st=1.5:d=0.5" \
  -c:v libx264 -pix_fmt yuv420p -movflags +faststart output.mp4
```

### Integration with Existing Bot (`server/bot.py`)

#### Video Generation Trigger
- Add handler for video generation requests in `ReceiveUserMessage`
- Detect trigger phrases: "create video", "make memory video", "generate video"
- Use existing conversation history and photo analysis data

#### Async Processing Flow
```python
async def _handle_video_generation(self, user_message: str):
    # 1. Generate storyboard from conversation
    # 2. Create AI captions using Gemini
    # 3. Generate frames with captions
    # 4. Assemble video with FFmpeg
    # 5. Upload to S3 and return URL
```

## File Structure

```
server/
├── bot.py                    # ✅ Existing - Add video generation handler
├── s3_manager.py            # ✅ Existing - Extend with video upload
├── image_analyzer.py        # ✅ Existing - Use for photo analysis
├── storyboard.py           # 🆕 New - Scene planning and structure
├── caption_generator.py     # 🆕 New - AI-powered caption creation
├── frame_creator.py         # 🆕 New - Image manipulation and overlay
└── video_generator.py       # 🆕 New - FFmpeg video assembly
```

## Dependencies

### Required (Already Available)
- ✅ `google-generativeai` - AI caption generation
- ✅ `Pillow>=10.0.0` - Image processing
- ✅ `boto3>=1.40.0` - S3 operations
- ✅ `ffmpeg` - Video processing

### Optional Enhancements
- `python-fontconfig` - Better font handling
- `imageio-ffmpeg` - Python FFmpeg wrapper (alternative to subprocess)

## Error Handling & Fallbacks

### Graceful Degradation
1. **FFmpeg Failure** - Return error message, suggest trying again
2. **Gemini API Limit** - Use predefined fallback captions
3. **S3 Upload Error** - Retry with exponential backoff
4. **Image Processing Error** - Log error and notify user

### Fallback Captions
```python
FALLBACK_CAPTIONS = [
    "A moment to remember",
    "Captured in time",
    "This memory matters",
    "Forever in my heart"
]
```

## Testing Strategy

### Unit Tests
- Caption generation with various conversation types
- Frame creation with different image formats
- FFmpeg video assembly
- S3 upload/download operations

### Integration Tests
- End-to-end video generation workflow
- Error handling and recovery
- Performance with various image sizes

### Manual Testing Scenarios
- Different photo formats (JPEG, PNG)
- Various conversation lengths and emotional tones
- Network interruption during processing
- Multiple concurrent video requests

## Performance Considerations

### Optimization Targets
- **Video Generation Time**: < 30 seconds for typical workflow
- **File Sizes**: Keep videos under 10MB for web delivery
- **Memory Usage**: Process images efficiently to avoid memory spikes

### Async Processing
- Use asyncio for non-blocking S3 operations
- Run FFmpeg in thread pool to avoid blocking event loop
- Implement progress feedback for long-running operations

## Future Enhancements (Post-Hackathon)

1. **Multiple Photos** - Support photo collages and sequences
2. **Background Music** - AI-generated ambient soundtracks
3. **Voice Narration** - User's voice overlaid on video
4. **Advanced Effects** - Ken Burns effect, color grading
5. **Template System** - Different video styles and themes
6. **Social Sharing** - Direct sharing to social platforms

## Success Metrics

### MVP Deliverables
- ✅ Generate 3-5 scene videos from single photo + conversation
- ✅ AI-powered contextual captions using Gemini
- ✅ Professional-quality visual presentation
- ✅ Web-compatible video output (MP4)
- ✅ Integration with existing voice conversation flow

### Quality Benchmarks
- Caption relevance and emotional resonance
- Video visual quality and smooth transitions
- Processing speed and reliability
- User satisfaction with generated content

## Implementation Timeline

### Phase 1: Core Components (2-3 hours)
1. Storyboard generator - Extract scenes from conversation
2. Caption generator - Gemini-powered caption creation
3. Frame creator - Image overlay and styling

### Phase 2: Video Assembly (1-2 hours)
4. Video generator - FFmpeg integration
5. S3 integration - Upload and URL generation

### Phase 3: Bot Integration (1 hour)
6. Update bot.py - Add video generation triggers
7. Testing and debugging - End-to-end workflow

### Total Estimated Time: 4-6 hours
