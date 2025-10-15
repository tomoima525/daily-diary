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
from pipecat.audio.turn.smart_turn.local_smart_turn_v3 import LocalSmartTurnAnalyzerV3
from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.audio.vad.vad_analyzer import VADParams
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineParams, PipelineTask
from pipecat.processors.aggregators.openai_llm_context import (
    OpenAILLMContext,
    OpenAILLMContextFrame,
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
from pipecat.transports.base_transport import BaseTransport
from pipecat.transports.daily.transport import DailyParams, DailyTransport

from user_message_processor import ReceiveUserMessageProcessor

load_dotenv(override=True)


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
            "content": SYSTEM_INSTRUCTION,
        },
        {
            "role": "assistant",
            "content": "Hi! Welcome to Daily Diary. How was your day today?",
        },
    ]

    # Set up conversation context and management
    # The context aggregator will automatically collect conversation context
    context = OpenAILLMContext(messages)
    context_aggregator = llm.create_context_aggregator(context)

    # RTVI events for Pipecat client UI
    rtvi = RTVIProcessor(config=RTVIConfig(config=[]))
    receive_user_message = ReceiveUserMessageProcessor()

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
