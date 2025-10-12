#
# Copyright (c) 2024–2025, Daily
#
# SPDX-License-Identifier: BSD 2-Clause License
#

"""Video Generator for Daily Diary Bot.

This module assembles video frames into MP4 videos using FFmpeg with smooth transitions
and uploads the final videos to S3 for web delivery.
"""

import asyncio
import os
import subprocess
import tempfile
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime

from loguru import logger
from s3_manager import S3PhotoManager
from storyboard import Scene


class VideoGenerator:
    """Generates MP4 videos from image frames using FFmpeg."""
    
    def __init__(self):
        self.s3_manager = S3PhotoManager()
        self.ffmpeg_path = "/opt/homebrew/bin/ffmpeg"
        
        # Video settings
        self.fps = 1  # Slow frame rate for memory video style
        self.fade_duration = 0.5  # seconds
        self.output_format = "mp4"
        
        # Verify FFmpeg availability
        self._verify_ffmpeg()
    
    def _verify_ffmpeg(self) -> None:
        """Verify that FFmpeg is available and executable."""
        if not os.path.exists(self.ffmpeg_path):
            logger.error(f"FFmpeg not found at {self.ffmpeg_path}")
            raise FileNotFoundError(f"FFmpeg not found at {self.ffmpeg_path}")
        
        try:
            # Test FFmpeg with version command
            result = subprocess.run([self.ffmpeg_path, "-version"], 
                                  capture_output=True, text=True, timeout=10)
            if result.returncode == 0:
                logger.info("FFmpeg is available and working")
            else:
                raise RuntimeError("FFmpeg test command failed")
        except Exception as e:
            logger.error(f"FFmpeg verification failed: {e}")
            raise
    
    async def create_memory_video(self, frame_paths: List[str], scenes: List[Scene], 
                                output_filename: Optional[str] = None) -> Optional[str]:
        """Create a memory video from frame paths and upload to S3.
        
        Args:
            frame_paths: List of paths to frame images
            scenes: List of Scene objects with timing information
            output_filename: Optional custom filename for the output video
            
        Returns:
            S3 URL of the uploaded video, or None if failed
        """
        if not frame_paths:
            logger.error("No frame paths provided for video creation")
            return None
        
        if len(frame_paths) != len(scenes):
            logger.warning(f"Frame count ({len(frame_paths)}) doesn't match scene count ({len(scenes)})")
            # Use the minimum count to avoid errors
            min_count = min(len(frame_paths), len(scenes))
            frame_paths = frame_paths[:min_count]
            scenes = scenes[:min_count]
        
        try:
            logger.info(f"Creating memory video from {len(frame_paths)} frames")
            
            # Generate unique output filename if not provided
            if not output_filename:
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                unique_id = str(uuid.uuid4())[:8]
                output_filename = f"memory_video_{timestamp}_{unique_id}.mp4"
            
            # Create temporary output path
            temp_output_path = os.path.join(tempfile.gettempdir(), output_filename)
            
            # Create video using FFmpeg
            video_created = await self._create_video_with_transitions(
                frame_paths, scenes, temp_output_path
            )
            
            if not video_created:
                logger.error("Failed to create video with FFmpeg")
                return None
            
            # Upload to S3
            s3_key = f"memory-videos/{output_filename}"
            upload_success = await self._upload_video_to_s3(temp_output_path, s3_key)
            
            if upload_success:
                # Generate presigned URL for immediate access
                video_url = await self.s3_manager.generate_presigned_url(s3_key, expiration=7200)  # 2 hours
                
                # Clean up temporary file
                self._cleanup_temp_file(temp_output_path)
                
                logger.info(f"Successfully created and uploaded memory video: {s3_key}")
                return video_url
            else:
                logger.error("Failed to upload video to S3")
                self._cleanup_temp_file(temp_output_path)
                return None
                
        except Exception as e:
            logger.error(f"Failed to create memory video: {e}")
            return None
    
    async def _create_video_with_transitions(self, frame_paths: List[str], 
                                           scenes: List[Scene], output_path: str) -> bool:
        """Create video using FFmpeg with fade transitions between frames.
        
        Args:
            frame_paths: List of image file paths
            scenes: List of Scene objects with duration info
            output_path: Path for output video file
            
        Returns:
            True if video creation successful, False otherwise
        """
        try:
            # Create input list file for FFmpeg
            input_list_path = await self._create_ffmpeg_input_list(frame_paths, scenes)
            
            if not input_list_path:
                return False
            
            # Calculate total duration
            total_duration = sum(scene.duration for scene in scenes)
            
            # Build FFmpeg command
            ffmpeg_cmd = [
                self.ffmpeg_path,
                "-y",  # Overwrite output file
                "-f", "concat",
                "-safe", "0",
                "-i", input_list_path,
                "-vf", self._build_video_filter(total_duration),
                "-c:v", "libx264",
                "-pix_fmt", "yuv420p",
                "-movflags", "+faststart",
                "-crf", "23",  # Good quality/size balance
                output_path
            ]
            
            logger.debug(f"FFmpeg command: {' '.join(ffmpeg_cmd)}")
            
            # Run FFmpeg in executor to avoid blocking
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(
                None,
                lambda: subprocess.run(
                    ffmpeg_cmd,
                    capture_output=True,
                    text=True,
                    timeout=120  # 2 minute timeout
                )
            )
            
            # Clean up input list file
            self._cleanup_temp_file(input_list_path)
            
            if result.returncode == 0:
                logger.info("FFmpeg video creation successful")
                return True
            else:
                logger.error(f"FFmpeg failed: {result.stderr}")
                return False
                
        except subprocess.TimeoutExpired:
            logger.error("FFmpeg command timed out")
            return False
        except Exception as e:
            logger.error(f"Error creating video with FFmpeg: {e}")
            return False
    
    async def _create_ffmpeg_input_list(self, frame_paths: List[str], 
                                      scenes: List[Scene]) -> Optional[str]:
        """Create FFmpeg input list file with frame durations.
        
        Args:
            frame_paths: List of frame image paths
            scenes: List of scenes with duration information
            
        Returns:
            Path to created input list file, or None if failed
        """
        try:
            temp_list_path = os.path.join(tempfile.gettempdir(), f"ffmpeg_input_{os.getpid()}.txt")
            
            with open(temp_list_path, 'w') as f:
                for frame_path, scene in zip(frame_paths, scenes):
                    # Escape path for FFmpeg
                    escaped_path = frame_path.replace("\\", "/").replace("'", "\\'")
                    f.write(f"file '{escaped_path}'\n")
                    f.write(f"duration {scene.duration}\n")
                
                # Add the last frame again for proper timing
                if frame_paths and scenes:
                    escaped_path = frame_paths[-1].replace("\\", "/").replace("'", "\\'")
                    f.write(f"file '{escaped_path}'\n")
            
            logger.debug(f"Created FFmpeg input list: {temp_list_path}")
            return temp_list_path
            
        except Exception as e:
            logger.error(f"Failed to create FFmpeg input list: {e}")
            return None
    
    def _build_video_filter(self, total_duration: float) -> str:
        """Build FFmpeg video filter string for transitions.
        
        Args:
            total_duration: Total duration of the video in seconds
        
        Returns:
            FFmpeg filter string for smooth transitions
        """
        # Calculate fade-out start time (total duration minus fade duration)
        fade_out_start = max(0, total_duration - self.fade_duration)
        
        # Simple fade in/out filter for smooth transitions
        return f"fade=t=in:st=0:d={self.fade_duration},fade=t=out:st={fade_out_start}:d={self.fade_duration}"
    
    async def _upload_video_to_s3(self, video_path: str, s3_key: str) -> bool:
        """Upload video file to S3.
        
        Args:
            video_path: Local path to video file
            s3_key: S3 object key for upload
            
        Returns:
            True if upload successful, False otherwise
        """
        try:
            # Read video file
            with open(video_path, 'rb') as video_file:
                video_data = video_file.read()
            
            # Upload to S3 using existing S3 client
            loop = asyncio.get_event_loop()
            success = await loop.run_in_executor(
                None,
                lambda: self.s3_manager.s3_client.put_object(
                    Bucket=self.s3_manager.bucket_name,
                    Key=s3_key,
                    Body=video_data,
                    ContentType="video/mp4",
                    ContentDisposition="inline",
                    CacheControl="max-age=86400"  # Cache for 24 hours
                )
            )
            
            logger.info(f"Successfully uploaded video to S3: {s3_key}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to upload video to S3: {e}")
            return False
    
    def _cleanup_temp_file(self, file_path: str) -> None:
        """Clean up a temporary file.
        
        Args:
            file_path: Path to file to delete
        """
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
                logger.debug(f"Cleaned up temp file: {file_path}")
        except Exception as e:
            logger.warning(f"Failed to clean up temp file {file_path}: {e}")
    
    def get_video_info(self) -> Dict[str, Any]:
        """Get information about video generation settings.
        
        Returns:
            Dictionary with video generation parameters
        """
        return {
            "ffmpeg_path": self.ffmpeg_path,
            "fps": self.fps,
            "fade_duration": self.fade_duration,
            "output_format": self.output_format,
            "ffmpeg_available": os.path.exists(self.ffmpeg_path)
        }
    
    async def create_test_video_from_frames(self, frame_paths: List[str], test_captions: List[str]) -> Optional[str]:
        """Create a test video from existing frame paths for development/testing purposes.
        
        Args:
            frame_paths: List of paths to frame images
            test_captions: List of test captions (for scene creation)
            
        Returns:
            Local path to created test video, or None if failed
        """
        try:
            from storyboard import Scene
            
            # Create test scenes
            scenes = [
                Scene(caption=caption, duration=2.5, emotional_tone="test")
                for caption in test_captions
            ]
            
            # Create test video (local only, don't upload to S3)
            temp_output_path = os.path.join(tempfile.gettempdir(), f"test_video_{os.getpid()}.mp4")
            
            success = await self._create_video_with_transitions(frame_paths, scenes, temp_output_path)
            
            if success:
                logger.info(f"Test video created: {temp_output_path}")
                return temp_output_path
            else:
                return None
                
        except Exception as e:
            logger.error(f"Failed to create test video: {e}")
            return None