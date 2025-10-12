#
# Copyright (c) 2024–2025, Daily
#
# SPDX-License-Identifier: BSD 2-Clause License
#

"""Frame Creator for Daily Diary Bot.

This module creates video frames by overlaying captions on user photos with
attractive visual styling for memory video generation.
"""

import os
import tempfile
from typing import List, Tuple, Optional

from loguru import logger
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from s3_manager import S3PhotoManager


class FrameCreator:
    """Creates video frames by overlaying captions on photos."""
    
    def __init__(self):
        self.s3_manager = S3PhotoManager()
        
        # Frame settings
        self.target_width = 1920
        self.target_height = 1080
        self.font_size = 48
        self.caption_margin = 60
        self.overlay_opacity = 180  # 0-255
        
        # Try to load a better font, fallback to default
        self.font = self._load_font()
    
    def _load_font(self) -> ImageFont.ImageFont:
        """Load the best available font for captions."""
        font_paths = [
            # macOS system fonts
            "/System/Library/Fonts/Helvetica.ttc",
            "/System/Library/Fonts/Arial.ttf",
            "/Library/Fonts/Arial.ttf",
            # Common Linux fonts
            "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            # Windows fonts (if running on Windows)
            "C:/Windows/Fonts/arial.ttf",
            "C:/Windows/Fonts/calibri.ttf"
        ]
        
        for font_path in font_paths:
            if os.path.exists(font_path):
                try:
                    return ImageFont.truetype(font_path, self.font_size)
                except Exception as e:
                    logger.warning(f"Failed to load font {font_path}: {e}")
                    continue
        
        # Fallback to default font
        try:
            return ImageFont.load_default()
        except Exception:
            logger.warning("Using PIL default font")
            return ImageFont.load_default()
    
    async def create_captioned_frames(self, base_image: Image.Image, captions: List[str]) -> List[str]:
        """Create video frames with captions overlaid on the base image.
        
        Args:
            base_image: PIL Image object to use as background
            captions: List of caption strings to overlay
            
        Returns:
            List of file paths to the created frame images
        """
        try:
            logger.info(f"Creating {len(captions)} captioned frames")
            
            # Prepare the base image
            prepared_image = self._prepare_base_image(base_image)
            
            frame_paths = []
            
            for i, caption in enumerate(captions):
                # Create frame with caption
                frame_image = self._create_single_frame(prepared_image, caption)
                
                # Save frame to temporary file
                frame_path = self._save_temp_frame(frame_image, i)
                frame_paths.append(frame_path)
                
                logger.debug(f"Created frame {i+1}/{len(captions)}: {caption[:50]}...")
            
            logger.info(f"Successfully created {len(frame_paths)} frames")
            return frame_paths
            
        except Exception as e:
            logger.error(f"Failed to create captioned frames: {e}")
            return []
    
    async def create_frames_from_s3_image(self, file_key: str, captions: List[str]) -> List[str]:
        """Create frames using an image downloaded from S3.
        
        Args:
            file_key: S3 object key for the image
            captions: List of caption strings
            
        Returns:
            List of file paths to created frames
        """
        try:
            # Download image from S3
            base_image = await self.s3_manager.download_image(file_key)
            if not base_image:
                logger.error(f"Failed to download image from S3: {file_key}")
                return []
            
            # Create frames
            return await self.create_captioned_frames(base_image, captions)
            
        except Exception as e:
            logger.error(f"Failed to create frames from S3 image {file_key}: {e}")
            return []
    
    def _prepare_base_image(self, image: Image.Image) -> Image.Image:
        """Prepare the base image for video frames (resize, format).
        
        Args:
            image: Original PIL Image
            
        Returns:
            Processed PIL Image ready for caption overlay
        """
        # Convert to RGB if needed
        if image.mode != 'RGB':
            image = image.convert('RGB')
        
        # Calculate resize dimensions maintaining aspect ratio
        original_width, original_height = image.size
        aspect_ratio = original_width / original_height
        target_aspect = self.target_width / self.target_height
        
        if aspect_ratio > target_aspect:
            # Image is wider - fit by height
            new_height = self.target_height
            new_width = int(new_height * aspect_ratio)
        else:
            # Image is taller - fit by width
            new_width = self.target_width
            new_height = int(new_width / aspect_ratio)
        
        # Resize image
        resized_image = image.resize((new_width, new_height), Image.Resampling.LANCZOS)
        
        # Create final canvas and center the image
        canvas = Image.new('RGB', (self.target_width, self.target_height), (0, 0, 0))
        
        # Calculate position to center the image
        x_offset = (self.target_width - new_width) // 2
        y_offset = (self.target_height - new_height) // 2
        
        canvas.paste(resized_image, (x_offset, y_offset))
        
        return canvas
    
    def _create_single_frame(self, base_image: Image.Image, caption: str) -> Image.Image:
        """Create a single frame with caption overlay.
        
        Args:
            base_image: Prepared base image
            caption: Caption text to overlay
            
        Returns:
            PIL Image with caption overlay
        """
        # Create a copy of the base image
        frame = base_image.copy()
        
        # Create drawing context
        draw = ImageDraw.Draw(frame)
        
        # Create semi-transparent overlay for text readability
        overlay = Image.new('RGBA', frame.size, (0, 0, 0, 0))
        overlay_draw = ImageDraw.Draw(overlay)
        
        # Calculate text dimensions and position
        text_bbox = draw.textbbox((0, 0), caption, font=self.font)
        text_width = text_bbox[2] - text_bbox[0]
        text_height = text_bbox[3] - text_bbox[1]
        
        # Position text in bottom third of image
        text_x = (self.target_width - text_width) // 2
        text_y = self.target_height - text_height - self.caption_margin
        
        # Create overlay rectangle for text background
        overlay_rect = [
            0,
            text_y - self.caption_margin // 2,
            self.target_width,
            self.target_height
        ]
        
        overlay_draw.rectangle(overlay_rect, fill=(0, 0, 0, self.overlay_opacity))
        
        # Composite overlay onto frame
        frame = Image.alpha_composite(frame.convert('RGBA'), overlay).convert('RGB')
        
        # Draw text with shadow for better readability
        draw = ImageDraw.Draw(frame)
        
        # Text shadow (offset by 2 pixels)
        shadow_color = (0, 0, 0)
        draw.text((text_x + 2, text_y + 2), caption, font=self.font, fill=shadow_color)
        
        # Main text
        text_color = (255, 255, 255)
        draw.text((text_x, text_y), caption, font=self.font, fill=text_color)
        
        return frame
    
    def _save_temp_frame(self, frame_image: Image.Image, frame_index: int) -> str:
        """Save frame to a temporary file.
        
        Args:
            frame_image: PIL Image to save
            frame_index: Index number for the frame
            
        Returns:
            Path to the saved temporary file
        """
        # Create temporary file
        temp_dir = tempfile.gettempdir()
        temp_filename = f"video_frame_{frame_index:03d}_{os.getpid()}.jpg"
        temp_path = os.path.join(temp_dir, temp_filename)
        
        # Save with high quality
        frame_image.save(temp_path, "JPEG", quality=95, optimize=True)
        
        logger.debug(f"Saved frame to: {temp_path}")
        return temp_path
    
    def cleanup_temp_frames(self, frame_paths: List[str]) -> None:
        """Clean up temporary frame files.
        
        Args:
            frame_paths: List of temporary file paths to delete
        """
        for frame_path in frame_paths:
            try:
                if os.path.exists(frame_path):
                    os.remove(frame_path)
                    logger.debug(f"Cleaned up temp frame: {frame_path}")
            except Exception as e:
                logger.warning(f"Failed to clean up temp frame {frame_path}: {e}")
    
    def get_frame_info(self) -> dict:
        """Get information about frame creation settings.
        
        Returns:
            Dictionary with frame creation parameters
        """
        return {
            "target_resolution": f"{self.target_width}x{self.target_height}",
            "font_size": self.font_size,
            "overlay_opacity": self.overlay_opacity,
            "font_loaded": str(self.font)
        }