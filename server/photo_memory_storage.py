#
# Copyright (c) 2024–2025, Daily
#
# SPDX-License-Identifier: BSD 2-Clause License
#

"""Photo Memory Storage for Daily Diary Bot.

This module provides centralized storage for photos and associated user feelings/stories.
It includes deduplication based on image hash to prevent storing duplicate photos.
"""

import asyncio
import hashlib
from collections import deque
from datetime import datetime
from io import BytesIO
from typing import Dict, List, Optional, Tuple

from loguru import logger
from PIL import Image


class PhotoMemoryStorage:
    """Centralized storage for photos and associated feelings with deduplication."""

    def __init__(self):
        self._photos: Dict[str, Dict] = {}
        self._photo_queue = deque()
        self._hash_to_name: Dict[str, str] = {}
        self._counter = 0
        self._lock = asyncio.Lock()

    def _calculate_image_hash(self, image: Image.Image) -> str:
        """Calculate SHA-256 hash of image data for deduplication.

        Args:
            image: PIL Image object

        Returns:
            SHA-256 hash string of the image data
        """
        buffer = BytesIO()
        image.save(buffer, format="PNG")
        image_data = buffer.getvalue()
        return hashlib.sha256(image_data).hexdigest()

    async def add_photo(
        self, image: Image.Image, file_path: str, original_file_key: Optional[str] = None
    ) -> Tuple[str, bool]:
        """Add a photo to storage with duplicate detection.

        Args:
            image: PIL Image object
            file_path: Path to the image file
            original_file_key: Original S3 file key (optional)

        Returns:
            Tuple of (photo_name, is_new) where is_new indicates if photo was newly added
        """
        async with self._lock:
            image_hash = self._calculate_image_hash(image)

            # Check if image already exists
            if image_hash in self._hash_to_name:
                existing_name = self._hash_to_name[image_hash]
                logger.info(f"Duplicate photo detected, using existing: {existing_name}")
                return existing_name, False

            # Create new photo entry
            photo_name = f"image_{self._counter}"
            self._counter += 1

            photo_data = {
                "photo_name": photo_name,
                "image": image,
                "file_path": file_path,
                "original_file_key": original_file_key,
                "size": image.size,
                "format": image.format,
                "hash": image_hash,
                "created_at": datetime.now(),
                "feelings": [],
            }

            self._photos[photo_name] = photo_data
            self._photo_queue.append(photo_name)
            self._hash_to_name[image_hash] = photo_name

            logger.info(f"Added new photo: {photo_name} (size: {image.size})")
            return photo_name, True

    async def add_feeling(
        self, photo_name: str, feeling: str, user_id: Optional[str] = None
    ) -> bool:
        """Add a feeling/story for a specific photo.

        Args:
            photo_name: Name of the photo
            feeling: User's feeling or story about the photo
            user_id: Optional user identifier

        Returns:
            True if feeling was added successfully, False if photo not found
        """
        async with self._lock:
            if photo_name not in self._photos:
                logger.error(f"Photo not found: {photo_name}")
                return False

            feeling_entry = {"feeling": feeling, "timestamp": datetime.now(), "user_id": user_id}

            self._photos[photo_name]["feelings"].append(feeling_entry)
            logger.info(f"Added feeling for photo {photo_name}")
            return True

    def get_photo(self, photo_name: str) -> Optional[Dict]:
        """Get photo data by name.

        Args:
            photo_name: Name of the photo

        Returns:
            Photo data dictionary or None if not found
        """
        return self._photos.get(photo_name)

    def get_photo_image(self, photo_name: str) -> Optional[Image.Image]:
        """Get PIL Image object by photo name.

        Args:
            photo_name: Name of the photo

        Returns:
            PIL Image object or None if not found
        """
        photo_data = self._photos.get(photo_name)
        return photo_data["image"] if photo_data else None

    def get_feelings(self, photo_name: str) -> List[Dict]:
        """Get all feelings for a specific photo.

        Args:
            photo_name: Name of the photo

        Returns:
            List of feeling dictionaries
        """
        photo_data = self._photos.get(photo_name)
        return photo_data["feelings"] if photo_data else []

    def get_all_photos(self) -> Dict[str, Dict]:
        """Get all stored photos.

        Returns:
            Dictionary of all photos indexed by photo name
        """
        return self._photos.copy()

    def get_photo_queue(self) -> deque:
        """Get the photo queue (for processing in order).

        Returns:
            Deque of photo names in order they were added
        """
        return self._photo_queue

    def pop_next_photo(self) -> Optional[str]:
        """Get and remove the next photo from the processing queue.

        Returns:
            Photo name or None if queue is empty
        """
        try:
            return self._photo_queue.popleft()
        except IndexError:
            return None

    def exists(self, photo_name: str) -> bool:
        """Check if a photo exists in storage.

        Args:
            photo_name: Name of the photo

        Returns:
            True if photo exists, False otherwise
        """
        return photo_name in self._photos

    def is_duplicate(self, image: Image.Image) -> Tuple[bool, Optional[str]]:
        """Check if an image is a duplicate of an existing photo.

        Args:
            image: PIL Image object to check

        Returns:
            Tuple of (is_duplicate, existing_photo_name)
        """
        image_hash = self._calculate_image_hash(image)
        if image_hash in self._hash_to_name:
            return True, self._hash_to_name[image_hash]
        return False, None

    def get_stats(self) -> Dict:
        """Get storage statistics.

        Returns:
            Dictionary with storage statistics
        """
        total_feelings = sum(len(photo["feelings"]) for photo in self._photos.values())
        for photo in self._photos.values():
            logger.info(f"==== photo {photo['photo_name']} has {len(photo['feelings'])} feelings")

        return {
            "total_photos": len(self._photos),
            "total_feelings": total_feelings,
            "queue_length": len(self._photo_queue),
            "unique_hashes": len(self._hash_to_name),
        }

    async def clear_all(self):
        """Clear all stored data (useful for testing or reset).

        Note: This will remove all photos and feelings from storage.
        """
        async with self._lock:
            self._photos.clear()
            self._photo_queue.clear()
            self._hash_to_name.clear()
            self._counter = 0
            logger.info("Cleared all photo memory storage")
