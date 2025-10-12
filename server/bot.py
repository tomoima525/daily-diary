#
# Copyright (c) 2024–2025, Daily
#
# SPDX-License-Identifier: BSD 2-Clause License
#

"""Gemini Bot Implementation.

This module implements a chatbot using Google's Gemini Multimodal Live model.
It includes:

- Real-time audio/video interaction
- Screen sharing analysis for location guessing
- Speech-to-speech model with visual reasoning

The bot runs as part of a pipeline that processes audio/video frames and manages
the conversation flow using Gemini's streaming capabilities.
"""

import os
from typing import Optional

from dotenv import load_dotenv
from loguru import logger
from pipecat.audio.turn.smart_turn.local_smart_turn_v3 import LocalSmartTurnAnalyzerV3
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.audio.vad.vad_analyzer import VADParams
from pipecat.frames.frames import (
    Frame,
    InputTextRawFrame,
)
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineParams, PipelineTask
from pipecat.processors.aggregators.openai_llm_context import (
    OpenAILLMContext,
    OpenAILLMContextFrame,
)
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor
from pipecat.processors.frameworks.rtvi import (
    RTVIClientMessageFrame,
    RTVIConfig,
    RTVIObserver,
    RTVIProcessor,
)
from pipecat.runner.types import RunnerArguments
from pipecat.runner.utils import create_transport
from pipecat.services.cartesia.tts import CartesiaTTSService
from pipecat.services.deepgram.stt import DeepgramSTTService
from pipecat.services.google.llm import GoogleLLMService
from pipecat.transports.base_transport import BaseTransport
from pipecat.transports.daily.transport import DailyParams, DailyTransport

from image_analyzer import ImageAnalyzer
from s3_manager import S3PhotoManager

load_dotenv(override=True)


class ReceiveUserMessage(FrameProcessor):
    """
    Receive user message and handle photo downloads from S3
    """

    def __init__(self):
        super().__init__()
        self._user_messages = []
        self._s3_manager = S3PhotoManager()
        self._image_analyzer = ImageAnalyzer()
        self._downloaded_images = []

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
            if isinstance(frame.data, dict) and frame.data.get("type") == "upload_message":
                # LLMMessagesAppendFrame
                # await self.push_frame(
                #     LLMMessagesAppendFrame(messages=[
                #         {
                #             "role": "user",
                #             "content": "Tell me a small joke while photo is uploading",
                #         }
                #     ], run_llm=True),
                #     direction=FrameDirection.UPSTREAM,
                # )
                await self.push_frame(
                    InputTextRawFrame(text="I'm uploading a photo now so that you can see it"),
                    direction=FrameDirection.UPSTREAM,
                )
                file_url = frame.data.get("file_url")
                if file_url:
                    message = await self._handle_photo_download(file_url)
                    # Create a dictionary using the file_url as key and message as value
                    user_message = {}
                    user_message[file_url] = {"content": message}
                    self._user_messages.append(user_message)
                    await self.push_frame(
                        InputTextRawFrame(text=message),
                        direction=FrameDirection.UPSTREAM,
                    )
            if isinstance(frame.data, dict) and frame.data.get("type") == "photo_impression":
                file_url = frame.data.get("file_url")
                user_message = self._user_messages.get(file_url)
                if user_message:
                    message = user_message[file_url]["content"]
                    user_message[file_url] = {
                        "content": message,
                        "impression": frame.data.get("impression"),
                    }

            if (
                isinstance(frame.data, dict)
                and frame.data.get("type") == "video_generation_request"
            ):
                # TODO: Handle video generation request
                pass

        else:
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
                # Store downloaded image
                image_data = {
                    "file_key": file_key,
                    "image": image,
                    "size": image.size,
                    "format": image.format,
                }
                self._downloaded_images.append(image_data)
                logger.info(f"Successfully processed photo: {file_key} ({image.size})")

                # Analyze the image with Gemini
                logger.info(f"Starting image analysis for {file_key}")
                analysis_response = await self._image_analyzer.analyze_and_respond(image, file_key)

                if analysis_response:
                    # Store the analysis
                    analysis_data = {
                        "file_key": file_key,
                        "response": analysis_response,
                        "timestamp": self._image_analyzer.genai_model.__class__.__name__,
                    }
                    self._image_analyses.append(analysis_data)

                    logger.info(f"Image analysis completed for {file_key}")
                    # Note: The analysis response will be handled by the conversation flow
                    # The Gemini Live model should pick up on the image context
                else:
                    # Use fallback response
                    fallback_response = self._image_analyzer.get_fallback_response()
                    analysis_data = {
                        "file_key": file_key,
                        "response": fallback_response,
                        "timestamp": "fallback",
                    }
                    self._image_analyses.append(analysis_data)
                    logger.warning(f"Used fallback response for {file_key}")
                return analysis_response
            else:
                logger.error(f"Failed to download photo: {file_key}")
                return None
        except Exception as e:
            logger.error(f"Error handling photo download for {file_key}: {e}")
            return None

    def get_user_messages(self):
        return self._user_messages

    def get_downloaded_images(self):
        """Get list of successfully downloaded images."""
        return self._downloaded_images

    def get_latest_image(self) -> Optional[dict]:
        """Get the most recently downloaded image."""
        return self._downloaded_images[-1] if self._downloaded_images else None

    def get_image_analyses(self):
        """Get list of image analyses."""
        return self._image_analyses

    def get_latest_analysis(self) -> Optional[dict]:
        """Get the most recent image analysis."""
        return self._image_analyses[-1] if self._image_analyses else None


SYSTEM_INSTRUCTION = f"""
You are Daily Diary, an AI assistant that helps users create beautiful memory videos from their daily stories.

Your conversation flow:
1. Warmly greet the user and ask about their day
2. Listen to their story with empathy and interest
3. Ask them to share a photo from their day
4. When they upload a photo, analyze it and ask questions about the moment
5. Offer to create a memory video with their story and photo

Be warm, empathetic, and creative in your responses. Help users capture not just what happened, but how it felt.
"""


async def run_bot(transport: BaseTransport, runner_args: RunnerArguments):
    """Main bot execution function.

    Sets up and runs the bot pipeline including:
    - Gemini Live multimodal model integration
    - Voice activity detection
    - RTVI event handling
    """

    stt = DeepgramSTTService(api_key=os.getenv("DEEPGRAM_API_KEY"))

    tts = CartesiaTTSService(
        api_key=os.getenv("CARTESIA_API_KEY"),
        voice_id="71a7ad14-091c-4e8e-a314-022ece01c121",  # British Reading Lady
    )

    llm = GoogleLLMService(api_key=os.getenv("GOOGLE_API_KEY"), model="gemini-2.0-flash-001")
    # llm.register...

    messages = [
        {
            "role": "system",
            "content": "Hi! Welcome to Daily Diary. How was your day today?",
        },
    ]

    # Set up conversation context and management
    # The context aggregator will automatically collect conversation context
    context = OpenAILLMContext(messages)
    context_aggregator = llm.create_context_aggregator(context)

    # RTVI events for Pipecat client UI
    rtvi = RTVIProcessor(config=RTVIConfig(config=[]))
    receive_user_message = ReceiveUserMessage()

    pipeline = Pipeline(
        [
            transport.input(),
            stt,
            rtvi,
            context_aggregator.user(),
            llm,
            tts,
            receive_user_message,
            transport.output(),
            context_aggregator.assistant(),
        ]
    )

    task = PipelineTask(
        pipeline,
        params=PipelineParams(
            enable_metrics=True,
            enable_usage_metrics=True,
        ),
        observers=[RTVIObserver(rtvi)],
    )

    @rtvi.event_handler("on_client_ready")
    async def on_client_ready(rtvi):
        await rtvi.set_bot_ready()
        # Start the conversation with initial message
        messages = [
            {
                "role": "user",
                "content": "Hi!",
            },
        ]
        context = OpenAILLMContext(messages=messages)
        await task.queue_frames([OpenAILLMContextFrame(context=context)])

    @transport.event_handler("on_client_connected")
    async def on_client_connected(transport: DailyTransport, participant):
        logger.info(f"Client connected")

    #     await transport.capture_participant_video(participant["id"], 1, "camera")

    #   await transport.capture_participant_video(participant["id"], 1, "screenVideo")

    @transport.event_handler("on_client_disconnected")
    async def on_client_disconnected(transport, client):
        logger.info(f"Client disconnected")
        await task.cancel()

    runner = PipelineRunner(handle_sigint=runner_args.handle_sigint)

    await runner.run(task)


async def bot(runner_args: RunnerArguments):
    """Main bot entry point for the bot starter."""

    # Krisp is available when deployed to Pipecat Cloud
    if os.environ.get("ENV") != "local":
        from pipecat.audio.filters.krisp_filter import KrispFilter

        krisp_filter = KrispFilter()
    else:
        krisp_filter = None

    transport_params = {
        "daily": lambda: DailyParams(
            audio_in_enabled=True,
            audio_in_filter=krisp_filter,
            audio_out_enabled=True,
            video_in_enabled=True,
            vad_analyzer=SileroVADAnalyzer(params=VADParams(stop_secs=0.2)),
            turn_analyzer=LocalSmartTurnAnalyzerV3(),
        )
    }

    transport = await create_transport(runner_args, transport_params)

    await run_bot(transport, runner_args)


if __name__ == "__main__":
    from pipecat.runner.run import main

    main()
