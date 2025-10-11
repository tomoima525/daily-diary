#
# Copyright (c) 2024–2025, Daily
#
# SPDX-License-Identifier: BSD 2-Clause License
#

"""S3 Photo Manager for Daily Diary Bot.

This module handles S3 operations for photo uploads and downloads,
including presigned URL generation and image processing with PIL.
"""

import asyncio
import os
from io import BytesIO
from typing import Optional

import boto3
from botocore.exceptions import ClientError
from loguru import logger
from PIL import Image


class S3PhotoManager:
    """Handles S3 operations for photo uploads and downloads."""
    
    def __init__(self):
        self.s3_client = boto3.client(
            "s3",
            region_name=os.getenv("AWS_REGION", "us-west-2")
        )
        self.bucket_name = os.getenv("S3_BUCKET_NAME", "daily-diary-storage-bucket")
    
    async def generate_presigned_url(self, file_key: str, expiration: int = 3600) -> Optional[str]:
        """Generate a presigned URL for downloading a file from S3.
        
        Args:
            file_key: The S3 object key
            expiration: Time in seconds for the presigned URL to remain valid
            
        Returns:
            The presigned URL string, or None if generation fails
        """
        try:
            # Run the synchronous boto3 operation in a thread pool
            loop = asyncio.get_event_loop()
            url = await loop.run_in_executor(
                None,
                lambda: self.s3_client.generate_presigned_url(
                    "get_object",
                    Params={"Bucket": self.bucket_name, "Key": file_key},
                    ExpiresIn=expiration
                )
            )
            logger.info(f"Generated presigned URL for {file_key}")
            return url
        except ClientError as e:
            logger.error(f"Failed to generate presigned URL for {file_key}: {e}")
            return None
    
    async def download_image(self, file_key: str) -> Optional[Image.Image]:
        """Download and return a PIL Image from S3.
        
        Args:
            file_key: The S3 object key
            
        Returns:
            PIL Image object, or None if download fails
        """
        try:
            # Run the synchronous boto3 operation in a thread pool
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None,
                lambda: self.s3_client.get_object(
                    Bucket=self.bucket_name,
                    Key=file_key
                )
            )
            
            # Load the image data
            image_data = response["Body"].read()
            image = Image.open(BytesIO(image_data))
            logger.info(f"Successfully downloaded image {file_key} ({image.size})")
            return image
        except ClientError as e:
            logger.error(f"Failed to download image {file_key}: {e}")
            return None
        except Exception as e:
            logger.error(f"Error processing image {file_key}: {e}")
            return None
    
    async def upload_image(self, image: Image.Image, file_key: str, format: str = "JPEG") -> bool:
        """Upload a PIL Image to S3.
        
        Args:
            image: PIL Image object to upload
            file_key: The S3 object key for the upload
            format: Image format (JPEG, PNG, etc.)
            
        Returns:
            True if upload successful, False otherwise
        """
        try:
            # Convert PIL Image to bytes
            image_buffer = BytesIO()
            image.save(image_buffer, format=format)
            image_buffer.seek(0)
            
            # Upload to S3
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                None,
                lambda: self.s3_client.put_object(
                    Bucket=self.bucket_name,
                    Key=file_key,
                    Body=image_buffer.getvalue(),
                    ContentType=f"image/{format.lower()}"
                )
            )
            
            logger.info(f"Successfully uploaded image to {file_key}")
            return True
        except ClientError as e:
            logger.error(f"Failed to upload image to {file_key}: {e}")
            return False
        except Exception as e:
            logger.error(f"Error uploading image to {file_key}: {e}")
            return False
    
    async def check_bucket_access(self) -> bool:
        """Check if we can access the S3 bucket.
        
        Returns:
            True if bucket is accessible, False otherwise
        """
        try:
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                None,
                lambda: self.s3_client.head_bucket(Bucket=self.bucket_name)
            )
            logger.info(f"Successfully connected to bucket: {self.bucket_name}")
            return True
        except ClientError as e:
            error_code = e.response['Error']['Code']
            if error_code == '404':
                logger.error(f"Bucket {self.bucket_name} does not exist")
            elif error_code == '403':
                logger.error(f"Access denied to bucket {self.bucket_name}")
            else:
                logger.error(f"Error accessing bucket {self.bucket_name}: {e}")
            return False