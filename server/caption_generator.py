#
# Copyright (c) 2024–2025, Daily
#
# SPDX-License-Identifier: BSD 2-Clause License
#

"""Caption Generator for Daily Diary Bot.

This module generates AI-powered captions for video scenes using Google Generative AI
to create personalized, emotionally resonant captions based on photos and conversations.
"""

import asyncio
import os
from typing import List, Optional

import google.generativeai as genai
from loguru import logger
from PIL import Image

from storyboard import Scene


class CaptionGenerator:
    """Generates AI-powered captions for video scenes using Gemini."""
    
    def __init__(self):
        # Initialize Google Generative AI
        genai.configure(api_key=os.getenv("GOOGLE_API_KEY"))
        self.genai_model = genai.GenerativeModel("gemini-2.0-flash-exp")
        
        # Fallback captions for when AI generation fails
        self.fallback_captions = [
            "A moment to remember",
            "Captured in time", 
            "This memory matters",
            "Forever in my heart",
            "A story worth telling"
        ]
    
    async def generate_scene_captions(self, image: Image.Image, transcript: str, scene_count: int) -> List[str]:
        """Generate captions for video scenes based on image and conversation.
        
        Args:
            image: PIL Image object of the photo
            transcript: The conversation transcript
            scene_count: Number of captions to generate
            
        Returns:
            List of caption strings for video scenes
        """
        try:
            logger.info(f"Generating {scene_count} captions for video scenes")
            
            # Create the prompt for Gemini
            prompt = self._create_caption_prompt(transcript, scene_count)
            
            # Generate captions using Gemini
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None, 
                lambda: self.genai_model.generate_content([prompt, image])
            )
            
            # Parse the response into individual captions
            captions = self._parse_caption_response(response.text, scene_count)
            
            logger.info(f"Successfully generated {len(captions)} captions")
            return captions
            
        except Exception as e:
            logger.error(f"Failed to generate captions: {e}")
            return self._get_fallback_captions(scene_count)
    
    async def generate_captions_for_scenes(self, image: Image.Image, transcript: str, scenes: List[Scene]) -> List[str]:
        """Generate captions specifically tailored to provided scenes.
        
        Args:
            image: PIL Image object of the photo
            transcript: The conversation transcript
            scenes: List of Scene objects with emotional tones
            
        Returns:
            List of caption strings matching the scenes
        """
        try:
            logger.info(f"Generating captions for {len(scenes)} specific scenes")
            
            # Create scene-specific prompt
            prompt = self._create_scene_specific_prompt(transcript, scenes)
            
            # Generate captions using Gemini
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None,
                lambda: self.genai_model.generate_content([prompt, image])
            )
            
            # Parse the response
            captions = self._parse_caption_response(response.text, len(scenes))
            
            logger.info(f"Successfully generated scene-specific captions")
            return captions
            
        except Exception as e:
            logger.error(f"Failed to generate scene-specific captions: {e}")
            return self._get_fallback_captions(len(scenes))
    
    def _create_caption_prompt(self, transcript: str, scene_count: int) -> str:
        """Create the prompt for Gemini to generate captions."""
        return f"""
Based on this conversation about someone's day: {transcript}

And looking at this photo, generate {scene_count} short, poetic captions (max 10 words each) that:

1. Tell the emotional story of this moment
2. Progress from the specific moment to universal feelings
3. Use warm, empathetic language
4. Capture the essence of this memory
5. Create a narrative arc suitable for a memory video

Guidelines for captions:
- Keep each caption under 10 words
- Make them emotionally resonant and personal
- Progress from specific to universal themes
- Use present tense when possible
- Avoid overly complex language
- Focus on feelings and emotions, not just descriptions

Return only the captions, one per line, without numbering or formatting.
"""
    
    def _create_scene_specific_prompt(self, transcript: str, scenes: List[Scene]) -> str:
        """Create a prompt tailored to specific scenes with emotional tones."""
        scene_descriptions = []
        for i, scene in enumerate(scenes, 1):
            scene_descriptions.append(f"Scene {i}: {scene.emotional_tone} tone - {scene.caption}")
        
        scene_info = "\n".join(scene_descriptions)
        
        return f"""
Based on this conversation: {transcript}

And looking at this photo, generate captions for these specific scenes:
{scene_info}

For each scene, create a caption (max 10 words) that matches the emotional tone:

Guidelines:
- Match the emotional tone specified for each scene
- Keep captions under 10 words each
- Make them flow together as a story
- Use warm, personal language
- Focus on emotions and feelings

Return only the captions, one per line, in the same order as the scenes listed above.
"""
    
    def _parse_caption_response(self, response_text: str, expected_count: int) -> List[str]:
        """Parse the AI response into individual captions."""
        if not response_text:
            return self._get_fallback_captions(expected_count)
        
        # Split by lines and clean up
        lines = [line.strip() for line in response_text.split('\n') if line.strip()]
        
        # Remove any numbering or formatting
        captions = []
        for line in lines:
            # Remove common prefixes like "1.", "Scene 1:", etc.
            line = line.replace('**', '').strip()
            if line.startswith(('1.', '2.', '3.', '4.', '5.')):
                line = line[2:].strip()
            if line.startswith('Scene'):
                # Find colon and take text after it
                colon_pos = line.find(':')
                if colon_pos != -1:
                    line = line[colon_pos + 1:].strip()
            
            if line and len(line.split()) <= 12:  # Allow slightly longer than 10 words
                captions.append(line)
        
        # Ensure we have the right number of captions
        if len(captions) < expected_count:
            captions.extend(self.fallback_captions[:expected_count - len(captions)])
        elif len(captions) > expected_count:
            captions = captions[:expected_count]
        
        return captions
    
    def _get_fallback_captions(self, count: int) -> List[str]:
        """Get fallback captions when AI generation fails."""
        if count <= len(self.fallback_captions):
            return self.fallback_captions[:count]
        
        # If we need more captions than we have fallbacks, repeat some
        captions = self.fallback_captions.copy()
        while len(captions) < count:
            captions.extend(self.fallback_captions[:min(count - len(captions), len(self.fallback_captions))])
        
        return captions[:count]
    
    async def test_caption_generation(self, transcript: str = None, scene_count: int = 3) -> List[str]:
        """Test caption generation without requiring an image (for development/testing).
        
        Args:
            transcript: Optional test transcript
            scene_count: Number of captions to generate
            
        Returns:
            List of test captions
        """
        test_transcript = transcript or "I went to the park today and saw the most beautiful sunset. It reminded me of my childhood when I used to watch sunsets with my grandmother. I felt so peaceful and grateful for this moment."
        
        try:
            # Create a simple prompt without image
            prompt = f"""
Based on this conversation: {test_transcript}

Generate {scene_count} short, poetic captions (max 10 words each) for a memory video that capture the emotional essence of this moment.

Return only the captions, one per line.
"""
            
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None,
                lambda: self.genai_model.generate_content(prompt)
            )
            
            captions = self._parse_caption_response(response.text, scene_count)
            logger.info(f"Generated test captions: {captions}")
            return captions
            
        except Exception as e:
            logger.error(f"Test caption generation failed: {e}")
            return self._get_fallback_captions(scene_count)