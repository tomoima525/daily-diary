#
# Copyright (c) 2024–2025, Daily
#
# SPDX-License-Identifier: BSD 2-Clause License
#

"""Storyboard Generator for Daily Diary Bot.

This module generates video storyboards by analyzing conversation transcripts
and creating structured scenes for memory video creation.
"""

import re
from dataclasses import dataclass
from typing import List, Optional

from loguru import logger


@dataclass
class Scene:
    """Represents a single scene in the video storyboard."""
    caption: str
    duration: float  # seconds
    emotional_tone: str


class StoryboardGenerator:
    """Generates video storyboards from conversation transcripts."""
    
    def __init__(self):
        self.default_scene_duration = 2.5
        self.min_scenes = 3
        self.max_scenes = 5
    
    def generate_from_conversation(self, transcript: str, photo_analysis: str) -> List[Scene]:
        """Generate scenes from conversation transcript and photo analysis.
        
        Args:
            transcript: The conversation transcript text
            photo_analysis: Analysis of the uploaded photo
            
        Returns:
            List of Scene objects for video generation
        """
        try:
            logger.info("Generating storyboard from conversation")
            
            # Extract key elements from transcript
            emotional_moments = self._extract_emotional_moments(transcript)
            key_themes = self._identify_themes(transcript, photo_analysis)
            
            # Generate scenes based on content
            scenes = self._create_scenes(emotional_moments, key_themes, photo_analysis)
            
            # Ensure we have the right number of scenes
            scenes = self._optimize_scene_count(scenes)
            
            logger.info(f"Generated {len(scenes)} scenes for storyboard")
            return scenes
            
        except Exception as e:
            logger.error(f"Failed to generate storyboard: {e}")
            return self._get_fallback_scenes()
    
    def _extract_emotional_moments(self, transcript: str) -> List[str]:
        """Extract emotionally significant moments from transcript."""
        emotional_keywords = {
            'positive': ['happy', 'joy', 'excited', 'amazing', 'wonderful', 'beautiful', 
                        'love', 'grateful', 'blessed', 'perfect', 'incredible'],
            'reflective': ['remember', 'think', 'realize', 'understand', 'feel', 
                          'moment', 'special', 'meaningful', 'important'],
            'nostalgic': ['memory', 'reminds', 'brings back', 'takes me back', 
                         'childhood', 'past', 'always', 'used to']
        }
        
        moments = []
        sentences = re.split(r'[.!?]+', transcript)
        
        for sentence in sentences:
            sentence = sentence.strip().lower()
            if len(sentence) < 10:  # Skip very short sentences
                continue
                
            # Check for emotional keywords
            emotion_score = 0
            for emotion_type, keywords in emotional_keywords.items():
                for keyword in keywords:
                    if keyword in sentence:
                        emotion_score += 1
                        break
            
            if emotion_score > 0:
                moments.append(sentence)
        
        return moments[:self.max_scenes]
    
    def _identify_themes(self, transcript: str, photo_analysis: str) -> List[str]:
        """Identify key themes from transcript and photo analysis."""
        combined_text = f"{transcript} {photo_analysis}".lower()
        
        theme_keywords = {
            'nature': ['outdoor', 'nature', 'park', 'tree', 'flower', 'sunset', 'sunrise', 'beach'],
            'family': ['family', 'mom', 'dad', 'sister', 'brother', 'child', 'parent', 'together'],
            'achievement': ['proud', 'accomplished', 'success', 'finished', 'completed', 'won'],
            'friendship': ['friend', 'friends', 'together', 'laugh', 'fun', 'enjoy'],
            'reflection': ['peaceful', 'quiet', 'think', 'contemplate', 'mindful', 'serene'],
            'celebration': ['celebrate', 'party', 'birthday', 'anniversary', 'milestone']
        }
        
        identified_themes = []
        for theme, keywords in theme_keywords.items():
            for keyword in keywords:
                if keyword in combined_text:
                    identified_themes.append(theme)
                    break
        
        return identified_themes[:3]  # Limit to top 3 themes
    
    def _create_scenes(self, emotional_moments: List[str], themes: List[str], photo_analysis: str) -> List[Scene]:
        """Create scenes based on extracted content."""
        scenes = []
        
        # Scene 1: Setting the moment (based on photo analysis)
        if photo_analysis:
            tone = self._determine_tone_from_analysis(photo_analysis)
            scenes.append(Scene(
                caption="This moment captured something special",
                duration=self.default_scene_duration,
                emotional_tone=tone
            ))
        
        # Scene 2-3: Emotional moments from conversation
        for i, moment in enumerate(emotional_moments[:2]):
            tone = self._determine_tone_from_text(moment)
            scenes.append(Scene(
                caption=self._extract_key_phrase(moment),
                duration=self.default_scene_duration,
                emotional_tone=tone
            ))
        
        # Final scene: Universal/reflective ending
        if themes:
            final_tone = "reflective"
            scenes.append(Scene(
                caption="A memory to treasure always",
                duration=self.default_scene_duration,
                emotional_tone=final_tone
            ))
        
        return scenes
    
    def _determine_tone_from_analysis(self, photo_analysis: str) -> str:
        """Determine emotional tone from photo analysis."""
        analysis_lower = photo_analysis.lower()
        
        if any(word in analysis_lower for word in ['happy', 'joy', 'smile', 'celebrate']):
            return "joyful"
        elif any(word in analysis_lower for word in ['peaceful', 'calm', 'serene', 'quiet']):
            return "peaceful"
        elif any(word in analysis_lower for word in ['warm', 'cozy', 'comfortable', 'home']):
            return "warm"
        else:
            return "contemplative"
    
    def _determine_tone_from_text(self, text: str) -> str:
        """Determine emotional tone from text content."""
        text_lower = text.lower()
        
        if any(word in text_lower for word in ['excited', 'amazing', 'wonderful', 'incredible']):
            return "excited"
        elif any(word in text_lower for word in ['grateful', 'blessed', 'thankful']):
            return "grateful"
        elif any(word in text_lower for word in ['remember', 'memory', 'reminds']):
            return "nostalgic"
        else:
            return "reflective"
    
    def _extract_key_phrase(self, sentence: str) -> str:
        """Extract a key phrase suitable for video caption."""
        # Remove common filler words and extract meaningful content
        words = sentence.split()
        
        # Filter out very common words
        filtered_words = []
        common_words = {'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'}
        
        for word in words:
            if word.lower() not in common_words and len(word) > 2:
                filtered_words.append(word)
        
        # Take up to 8 words for caption length
        key_phrase = ' '.join(filtered_words[:8])
        
        # Capitalize first letter and ensure it ends properly
        if key_phrase:
            key_phrase = key_phrase[0].upper() + key_phrase[1:]
            if not key_phrase.endswith(('.', '!', '?')):
                key_phrase += '.'
        
        return key_phrase or "A moment worth remembering."
    
    def _optimize_scene_count(self, scenes: List[Scene]) -> List[Scene]:
        """Ensure optimal number of scenes (3-5)."""
        if len(scenes) < self.min_scenes:
            # Add fallback scenes
            while len(scenes) < self.min_scenes:
                scenes.append(Scene(
                    caption="This moment tells a story",
                    duration=self.default_scene_duration,
                    emotional_tone="contemplative"
                ))
        elif len(scenes) > self.max_scenes:
            # Keep the most emotionally resonant scenes
            scenes = scenes[:self.max_scenes]
        
        return scenes
    
    def _get_fallback_scenes(self) -> List[Scene]:
        """Return fallback scenes when generation fails."""
        return [
            Scene(
                caption="A moment captured in time",
                duration=self.default_scene_duration,
                emotional_tone="contemplative"
            ),
            Scene(
                caption="This memory matters",
                duration=self.default_scene_duration,
                emotional_tone="warm"
            ),
            Scene(
                caption="Forever in my heart",
                duration=self.default_scene_duration,
                emotional_tone="nostalgic"
            )
        ]