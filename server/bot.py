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

from dotenv import load_dotenv
from loguru import logger
from PIL import Image
from pipecat.adapters.schemas.function_schema import FunctionSchema
from pipecat.adapters.schemas.tools_schema import ToolsSchema
from pipecat.audio.turn.smart_turn.local_smart_turn_v3 import LocalSmartTurnAnalyzerV3
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.audio.vad.vad_analyzer import VADParams
from pipecat.frames.frames import TTSSpeakFrame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineParams, PipelineTask
from pipecat.processors.aggregators.openai_llm_context import (
    OpenAILLMContext,
)
from pipecat.processors.frameworks.rtvi import (
    RTVIConfig,
    RTVIObserver,
    RTVIProcessor,
)
from pipecat.runner.types import RunnerArguments
from pipecat.runner.utils import create_transport
from pipecat.services.cartesia.tts import CartesiaTTSService
from pipecat.services.deepgram.stt import DeepgramSTTService
from pipecat.services.google.llm import GoogleLLMService
from pipecat.services.llm_service import FunctionCallParams
from pipecat.transports.base_transport import BaseTransport
from pipecat.transports.daily.transport import DailyParams, DailyTransport

from image_analyzer import ImageAnalyzer
from photo_memory_storage import PhotoMemoryStorage
from user_message_processor import ReceiveUserMessageProcessor

load_dotenv(override=True)


SYSTEM_INSTRUCTION = f"""
You are Daily Diary, an AI assistant that helps users create beautiful memory videos from their daily stories.

Your conversation flow:
3. Ask them to share photos that highlight their day. Tell them to let them know when they finished uploading. The photos are stored in a queue.
4. Analyze photos one by one and ask feelings and stories about the moment until all photos in the queue are reviewed. 
5. When all photos are reviewed, Offer to create a memory video with their story and photo

Be warm, empathetic, and creative in your responses. Help users capture not just what happened, but how it felt.

You have access to four tools: get_photo_name, analyze_photo, store_user_feelings, generate_video

For getting a photo name from stored images, use `get_photo_name` function. It will return the name of the photo(e.g. image_0, image_1, etc.) or None if there is no photo in the queue.
For photo analysis, use `analyze_photo` function. It will return the name of the photo(e.g. image_0, image_1, etc.) and description of what's in the photo.
For storing user's feelings about each photo, use `store_user_feelings` function.
For generating a video, use `generate_video` function.
"""

image_analyzer = ImageAnalyzer()
photo_storage = PhotoMemoryStorage()
receive_user_message = ReceiveUserMessageProcessor(photo_storage)


# functions
async def get_photo_name(params: FunctionCallParams):
    photo_name = photo_storage.pop_next_photo()
    if photo_name:
        logger.info(f"==== photo_name {photo_name}")
        await params.result_callback(photo_name)
    else:
        logger.info(f"No photo in the queue")
        await params.result_callback(None)


async def analyze_photo(params: FunctionCallParams):
    photo_name = params.arguments["photo_name"]
    image = photo_storage.get_photo_image(photo_name)

    if image:
        logger.info(f"==== analyzing photo {photo_name} with size {image.size}")
        await params.llm.push_frame(
            TTSSpeakFrame(f"Give me a sec, analyzing photo {photo_name}...")
        )
        description = await image_analyzer.analyze_and_respond(image)
        logger.info(f"==== description {description}")
        await params.result_callback(
            {
                "photo_name": photo_name,
                "description": description,
            }
        )
    else:
        logger.error(f"==== no image found for photo_name {photo_name}")
        await params.result_callback(None)


async def store_user_feelings(params: FunctionCallParams):
    photo_name = params.arguments["photo_name"]
    feelings = params.arguments["feelings"]

    await params.llm.push_frame(TTSSpeakFrame(f"Storing feelings for this photo."))

    success = await photo_storage.add_feeling(photo_name, feelings)

    if success:
        logger.info(f"==== stored feelings for photo {photo_name}")
        await params.result_callback(
            {
                "status": "success",
                "message": f"Feelings stored for {photo_name}",
            }
        )
    else:
        logger.error(f"==== failed to store feelings for photo {photo_name}")
        await params.result_callback(
            {
                "status": "error",
                "message": f"Photo {photo_name} not found",
            }
        )


async def generate_video(params: FunctionCallParams):
    """Generate a memory video from stored photos and feelings."""
    stats = photo_storage.get_stats()

    logger.info(
        f"==== generating video with {stats['total_photos']} photos and {stats['total_feelings']} feelings"
    )

    await params.llm.push_frame(
        TTSSpeakFrame(
            f"Generating video with {stats['total_photos']} photos and {stats['total_feelings']} feelings. Give me a second"
        )
    )

    # TODO: Implement actual video generation logic
    # For now, return a placeholder response
    await params.result_callback(
        {
            "status": "success",
            "message": f"Memory video generated with {stats['total_photos']} photos",
            "video_url": "https://placeholder-video-url.com/memory_video.mp4",
        }
    )


async def run_bot(transport: BaseTransport, runner_args: RunnerArguments):
    """Main bot execution function.

    Sets up and runs the bot pipeline including:
    - Gemini model integration
    - Voice activity detection
    - RTVI event handling
    """

    stt = DeepgramSTTService(api_key=os.getenv("DEEPGRAM_API_KEY"))

    tts = CartesiaTTSService(
        api_key=os.getenv("CARTESIA_API_KEY"),
        voice_id="cd17ff2d-5ea4-4695-be8f-42193949b946",  # Meditation lady
    )

    llm = GoogleLLMService(api_key=os.getenv("GOOGLE_API_KEY"), model="gemini-2.5-flash")

    # Function calls
    get_photo_name_function = FunctionSchema(
        name="get_photo_name",
        description="Get a photo name from stored photo queue. If there is no photo in the queue, return None",
        properties={},
        required=[],
    )

    analyze_photo_function = FunctionSchema(
        name="analyze_photo",
        description="Analyze photo and returns the name of the photo(e.g. image_0, image_1, etc.) and description of what's in the photo",
        properties={
            "photo_name": {
                "type": "string",
                "description": "The name of a photo file(e.g. image_0, image_1, etc.)",
            },
        },
        required=["photo_name"],
    )

    store_user_feelings_function = FunctionSchema(
        name="store_user_feelings",
        description="Store user feelings and stories to a data storage",
        properties={
            "photo_name": {
                "type": "string",
                "description": "The name of a photo file",
            },
            "feelings": {"type": "string", "description": "User's feelings and stories"},
        },
        required=["photo_name", "feelings"],
    )

    generate_video_function = FunctionSchema(
        name="generate_video",
        description="Generate video and provide the url of the video",
        properties={},
        required=[],
    )

    tools = ToolsSchema(
        standard_tools=[
            get_photo_name_function,
            analyze_photo_function,
            store_user_feelings_function,
            generate_video_function,
        ]
    )

    # Register function handlers with LLM
    llm.register_function("get_photo_name", get_photo_name)
    llm.register_function("analyze_photo", analyze_photo)
    llm.register_function("store_user_feelings", store_user_feelings)
    llm.register_function("generate_video", generate_video)

    messages = [
        {
            "role": "system",
            "content": SYSTEM_INSTRUCTION,
        },
    ]

    # Set up conversation context and management
    # The context aggregator will automatically collect conversation context
    context = OpenAILLMContext(messages, tools=tools)
    context_aggregator = llm.create_context_aggregator(context)

    # RTVI events for Pipecat client UI
    rtvi = RTVIProcessor(config=RTVIConfig(config=[]))

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
        await task.queue_frames(
            [TTSSpeakFrame("Hi! Welcome to Daily Diary. How was your day today?")]
        )

    @transport.event_handler("on_client_connected")
    async def on_client_connected(transport: DailyTransport, participant):
        logger.info(f"Client connected")

    #   await transport.capture_participant_video(participant["id"], 1, "camera")
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
