import { RTVIEvent, BotTTSTextData } from "@pipecat-ai/client-js";
import {
  usePipecatClientTransportState,
  useRTVIClientEvent,
} from "@pipecat-ai/client-react";
import { TranscriptOverlayComponent } from "@pipecat-ai/voice-ui-kit";
import { useState, useCallback } from "react";

/**
 * Base props shared by all transcript overlay components
 */
interface BaseTranscriptOverlayProps {
  /** Additional CSS classes to apply to the component */
  className?: string;
  /** Size variant of the transcript overlay */
  size?: "sm" | "md" | "lg";
  /** Duration of the fade-in animation in milliseconds (default: 300) */
  fadeInDuration?: number;
  /** Duration of the fade-out animation in milliseconds (default: 1000) */
  fadeOutDuration?: number;
}

interface TranscriptOverlayProps extends BaseTranscriptOverlayProps {
  /** The participant type - "local" for user speech, "remote" for bot speech */
  participant: "local" | "remote";
}

// Custom TranscriptOverlay component to keep text
export const CustomTranscriptOverlay = ({
  participant = "remote",
  className,
  size = "md",
  fadeInDuration = 300,
  fadeOutDuration = 1000,
}: TranscriptOverlayProps) => {
  const [transcript, setTranscript] = useState<string[]>([]);
  const [turnEnd, setIsTurnEnd] = useState(false);
  const transportState = usePipecatClientTransportState();

  useRTVIClientEvent(
    RTVIEvent.BotTtsText,
    useCallback(
      (event: BotTTSTextData) => {
        if (participant === "local") {
          return;
        }

        if (turnEnd) {
          setTranscript([]);
          setIsTurnEnd(false);
        }

        setTranscript((prev) => [...prev, event.text]);
      },
      [turnEnd, participant]
    )
  );

  useRTVIClientEvent(
    RTVIEvent.BotStoppedSpeaking,
    useCallback(() => {
      if (participant === "local") {
        return;
      }
      setIsTurnEnd(true);
    }, [participant])
  );

  useRTVIClientEvent(
    RTVIEvent.BotTtsStopped,
    useCallback(() => {
      if (participant === "local") {
        return;
      }
      // So we don't want to set turn end here because we want to keep the transcript until the bot stops speaking.
      // setIsTurnEnd(true);
    }, [participant])
  );

  if (transcript.length === 0 || transportState !== "ready") {
    return null;
  }

  return (
    <TranscriptOverlayComponent
      words={transcript}
      size={size}
      turnEnd={undefined}
      className={className}
      fadeInDuration={fadeInDuration}
      fadeOutDuration={fadeOutDuration}
    />
  );
};
