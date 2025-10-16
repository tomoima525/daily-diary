from typing import Optional

from loguru import logger
from pipecat.frames.frames import (
    Frame,
    # LLMMessagesAppendFrame,
)

# from pipecat.processors.aggregators.openai_llm_context import (
#     OpenAILLMContext,
#     OpenAILLMContextFrame,
# )
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor
from pipecat.processors.frameworks.rtvi import (
    RTVIClientMessageFrame,
)

from photo_memory_storage import PhotoMemoryStorage
from s3_manager import S3PhotoManager


class ReceiveUserMessageProcessor(FrameProcessor):
    """
    Receive user message and handle photo downloads from S3
    """

    def __init__(self, photo_storage: Optional[PhotoMemoryStorage] = None):
        super().__init__()
        self._s3_manager = S3PhotoManager()
        self._photo_storage = photo_storage if photo_storage is not None else PhotoMemoryStorage()

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        """Process incoming frames and store user message.

        Args:
            frame: The incoming frame to process
            direction: The direction of frame flow in the pipeline
        """
        await super().process_frame(frame, direction)

        # Store user message and handle photo downloads
        if isinstance(frame, RTVIClientMessageFrame):
            # Check if this is a photo upload message
            if isinstance(frame.data, dict) and frame.data.get("type") == "photo_upload":
                # An example to send message to LLM
                # # LLMMessagesAppendFrame
                # await self.push_frame(
                #     LLMMessagesAppendFrame(
                #         messages=[
                #             {
                #                 "role": "system",
                #                 "content": "Ask user if you want to upload more photo",
                #             }
                #         ],
                #         run_llm=True,
                #     ),
                #     direction=FrameDirection.UPSTREAM,
                # )
                # context = OpenAILLMContext(
                #     messages=[
                #         {
                #             "role": "system",
                #             "content": "",
                #         }
                #     ],
                # )
                # await self.push_frame(
                #     OpenAILLMContextFrame(
                #         run_llm=True,
                #     ),
                #     direction=FrameDirection.UPSTREAM,
                # )

                file_url = frame.data.get("file_url")
                if file_url:
                    await self._handle_photo_download(file_url)

        await self.push_frame(frame, direction)

    async def _handle_photo_download(self, file_key: str):
        """Handle downloading a photo from S3 when user uploads one.

        Args:
            file_key: The S3 object key for the uploaded photo

        """
        try:
            # Download the image
            image = await self._s3_manager.download_image(file_key)
            if image:
                # Add to photo storage with deduplication
                photo_name, is_new = await self._photo_storage.add_photo(
                    image=image,
                    file_path=file_key,
                    original_file_key=file_key
                )
                
                if is_new:
                    logger.info(f"Successfully processed new photo: {photo_name} from {file_key} ({image.size})")
                else:
                    logger.info(f"Photo already exists as: {photo_name} from {file_key}")
                    
                return photo_name
            else:
                logger.error(f"Failed to download photo: {file_key}")
                return None
        except Exception as e:
            logger.error(f"Error handling photo download for {file_key}: {e}")
            return None

    def get_photo_storage(self) -> PhotoMemoryStorage:
        """Get the photo storage instance"""
        return self._photo_storage

    def get_downloaded_images_queue(self):
        """Get queue of successfully downloaded items (legacy method)"""
        return self._photo_storage.get_photo_queue()

    def get_downloaded_images_list(self):
        """Get list of successfully downloaded items (legacy method)"""
        return list(self._photo_storage.get_all_photos().values())
