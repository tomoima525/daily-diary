#
# Copyright (c) 2024–2025, Daily
#
# SPDX-License-Identifier: BSD 2-Clause License
#

"""Image Analysis Manager for Daily Diary Bot.

This module handles image analysis using Google Generative AI to understand
emotions, content, and generate empathetic responses about user photos.
"""

import asyncio
import os
from typing import Any, Dict, Optional
import google.generativeai as genai
from loguru import logger
from PIL import Image


analysis_prompt = """
Look at this photo and analyze it as if you're helping someone create a memory diary. 

Please provide:
1. A brief description of what you see in the photo
2. The emotional tone or mood you sense from the scene/people
3. What kind of moment this appears to be (celebration, quiet moment, adventure, etc.)
4. A warm, empathetic question about their feelings or thoughts during this moment

Keep your response conversational and caring, as if talking to a friend about their memories.
This response will be used in a voice conversation, so keep it short and make it sound like a conversation.
"""


class ImageAnalyzer:
    """Handles image analysis using Google Generative AI."""

    def __init__(self):
        # Initialize Google Generative AI
        genai.configure(api_key=os.getenv("GOOGLE_API_KEY"))
        self.genai_model = genai.GenerativeModel(
            "gemini-2.0-flash-exp", system_instruction=analysis_prompt
        )

        # Analysis prompt template for Daily Diary context

    async def _analyze_image(
        self, image: Image.Image, file_key: str = ""
    ) -> Optional[Dict[str, Any]]:
        """Analyze an image using Google Generative AI to understand emotions and content.

        Args:
            image: PIL Image object to analyze
            file_key: The S3 object key for context (optional)

        Returns:
            Dictionary with analysis results, or None if analysis fails
        """
        try:
            logger.info(f"Starting image analysis for {file_key or 'uploaded image'}")

            # Run the analysis in a thread pool to avoid blocking
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None, lambda: self.genai_model.generate_content(["Analyze this photo", image])
            )

            analysis_text = response.text
            logger.info(f"Successfully analyzed image {file_key}")

            return {
                "file_key": file_key,
                "analysis": analysis_text,
                "timestamp": loop.time(),
                "model": "gemini-2.0-flash-exp",
                "image_size": image.size,
                "image_format": image.format,
            }

        except Exception as e:
            logger.error(f"Failed to analyze image {file_key}: {e}")
            return None

    async def generate_memory_response(self, analysis_result: Dict[str, Any]) -> Optional[str]:
        """Generate a personalized response based on image analysis for Daily Diary.

        Args:
            analysis_result: Result from analyze_image method

        Returns:
            Formatted response string ready for voice conversation, or None if failed
        """
        try:
            if not analysis_result or "analysis" not in analysis_result:
                return None

            # The analysis already contains a conversational response
            # We can enhance it further if needed, but for now return as-is
            response = analysis_result["analysis"]

            logger.info("Generated memory response successfully")
            return response

        except Exception as e:
            logger.error(f"Failed to generate memory response: {e}")
            return None

    async def analyze_and_respond(self, image: Image.Image, file_key: str = "") -> Optional[str]:
        """Complete workflow: analyze image and generate response for Daily Diary.

        Args:
            image: PIL Image object to analyze
            file_key: The S3 object key for context (optional)

        Returns:
            Ready-to-use response string for voice conversation, or None if failed
        """
        try:
            # Analyze the image
            analysis_result = await self._analyze_image(image, file_key)
            logger.info(f"Analysis result: {analysis_result}")

            if not analysis_result:
                return None

            # Generate the memory response
            response = await self.generate_memory_response(analysis_result)
            logger.info(f"Analysis response: {response}")
            return response

        except Exception as e:
            logger.error(f"Failed in analyze_and_respond workflow: {e}")
            return None

    def get_fallback_response(self) -> str:
        """Get a fallback response when image analysis fails."""
        return (
            "I can see you've shared a photo with me! While I'm having trouble analyzing "
            "the details right now, I'd love to hear about this moment from you. "
            "What was happening when you took this photo, and how were you feeling?"
        )
