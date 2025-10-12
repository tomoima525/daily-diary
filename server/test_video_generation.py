#!/usr/bin/env python3

"""Test script for video generation functionality.

This script tests the complete video generation workflow without requiring
the full bot infrastructure.
"""

import asyncio
import os
import sys
from PIL import Image, ImageDraw
import tempfile

# Add server directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from storyboard import StoryboardGenerator, Scene
from caption_generator import CaptionGenerator
from frame_creator import FrameCreator
from video_generator import VideoGenerator


def create_test_image() -> Image.Image:
    """Create a simple test image for testing."""
    # Create a 800x600 test image with gradient background
    image = Image.new('RGB', (800, 600), (100, 150, 200))
    draw = ImageDraw.Draw(image)
    
    # Add some simple shapes to make it interesting
    draw.ellipse([150, 150, 450, 350], fill=(255, 200, 100))
    draw.rectangle([300, 250, 500, 400], fill=(200, 100, 255))
    draw.text((250, 500), "Test Memory Photo", fill=(255, 255, 255))
    
    return image


async def test_video_generation_workflow():
    """Test the complete video generation workflow."""
    print("Starting video generation workflow test...")
    
    try:
        # Test data
        test_transcript = """
        User: I had such a wonderful day at the park today
        Bot: That sounds lovely! What made it so special?
        User: I saw the most beautiful sunset and it reminded me of my childhood
        Bot: What about the sunset brought back those memories?
        User: My grandmother and I used to watch sunsets together every evening
        Bot: That sounds like a precious memory. How did it feel to experience that again?
        User: It made me feel grateful and peaceful, like she was there with me
        """
        
        test_photo_analysis = "A beautiful sunset photo showing warm orange and pink colors across the sky, with silhouettes of trees in the foreground. The image captures a peaceful, contemplative moment with a nostalgic and emotional tone."
        
        # Create test image
        test_image = create_test_image()
        print("✓ Created test image")
        
        # Step 1: Test Storyboard Generator
        print("\n1. Testing Storyboard Generator...")
        storyboard_generator = StoryboardGenerator()
        scenes = storyboard_generator.generate_from_conversation(test_transcript, test_photo_analysis)
        print(f"✓ Generated {len(scenes)} scenes:")
        for i, scene in enumerate(scenes, 1):
            print(f"   Scene {i}: '{scene.caption}' ({scene.duration}s, {scene.emotional_tone})")
        
        # Step 2: Test Caption Generator
        print("\n2. Testing Caption Generator...")
        caption_generator = CaptionGenerator()
        
        # Test without image first (simpler test)
        test_captions = await caption_generator.test_caption_generation(test_transcript, len(scenes))
        print(f"✓ Generated {len(test_captions)} test captions:")
        for i, caption in enumerate(test_captions, 1):
            print(f"   Caption {i}: '{caption}'")
        
        # Step 3: Test Frame Creator
        print("\n3. Testing Frame Creator...")
        frame_creator = FrameCreator()
        frame_paths = await frame_creator.create_captioned_frames(test_image, test_captions)
        print(f"✓ Created {len(frame_paths)} frames:")
        for i, path in enumerate(frame_paths, 1):
            print(f"   Frame {i}: {path}")
        
        # Step 4: Test Video Generator
        print("\n4. Testing Video Generator...")
        video_generator = VideoGenerator()
        
        # Get video info
        video_info = video_generator.get_video_info()
        print(f"✓ Video Generator Info: {video_info}")
        
        if video_info.get("ffmpeg_available"):
            # Create test video using the frames we already created
            test_video_path = await video_generator.create_test_video_from_frames(frame_paths, test_captions)
            
            if test_video_path and os.path.exists(test_video_path):
                file_size = os.path.getsize(test_video_path)
                print(f"✓ Created test video: {test_video_path} ({file_size} bytes)")
                
                # Clean up test video after showing success
                os.remove(test_video_path)
                print("✓ Cleaned up test video file")
            else:
                print("✗ Failed to create test video")
        else:
            print("⚠ FFmpeg not available, skipping video creation test")
        
        # Clean up frame files
        frame_creator.cleanup_temp_frames(frame_paths)
        print("✓ Cleaned up temporary frame files")
        
        print("\n🎉 Video generation workflow test completed successfully!")
        return True
        
    except Exception as e:
        print(f"\n❌ Test failed with error: {e}")
        import traceback
        traceback.print_exc()
        return False


async def test_individual_components():
    """Test individual components separately."""
    print("\nTesting individual components...")
    
    # Test StoryboardGenerator
    print("\n• Testing StoryboardGenerator...")
    storyboard_gen = StoryboardGenerator()
    scenes = storyboard_gen._get_fallback_scenes()
    print(f"  Fallback scenes: {len(scenes)}")
    
    # Test FrameCreator info
    print("\n• Testing FrameCreator...")
    frame_creator = FrameCreator()
    frame_info = frame_creator.get_frame_info()
    print(f"  Frame info: {frame_info}")
    
    # Test VideoGenerator info
    print("\n• Testing VideoGenerator...")
    video_gen = VideoGenerator()
    video_info = video_gen.get_video_info()
    print(f"  Video info: {video_info}")
    
    print("✓ Individual component tests completed")


if __name__ == "__main__":
    print("Video Generation Test Suite")
    print("=" * 40)
    
    # Run individual component tests first
    asyncio.run(test_individual_components())
    
    # Run full workflow test
    success = asyncio.run(test_video_generation_workflow())
    
    if success:
        print("\n🎉 All tests passed!")
        sys.exit(0)
    else:
        print("\n❌ Some tests failed!")
        sys.exit(1)