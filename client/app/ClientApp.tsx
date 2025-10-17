"use client";

import {
  PipecatClientVideo,
  usePipecatClient,
  usePipecatClientCamControl,
  useRTVIClientEvent,
} from "@pipecat-ai/client-react";
import {
  Button,
  Card,
  CardContent,
  cn,
  ConnectButton,
  Conversation,
  Panel,
  PanelContent,
  PanelHeader,
  PanelTitle,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  TranscriptOverlay,
  usePipecatConnectionState,
  UserAudioControl,
  UserScreenControl,
  UserVideoControl,
} from "@pipecat-ai/voice-ui-kit";
import React, { useCallback, useEffect, useState } from "react";
import { Logs, MonitorOff } from "lucide-react";
import { EventStreamPanel } from "./EventStreamPanel";
import { PhotoUpload } from "./components/PhotoUpload";
import { VideoDisplay } from "./components/VideoDisplay";
import { PhotoDisplay } from "./components/PhotoDisplay";
import Image from "next/image";
import { CustomTranscriptOverlay } from "./components/CustomTextOverlay";
import { RTVIEvent, ServerMessageData } from "@pipecat-ai/client-js";
import { useVideoPolling } from "./hooks/useVideoPolling";

interface Props {
  connect?: () => void | Promise<void>;
  disconnect?: () => void | Promise<void>;
  isMobile: boolean;
}

interface VideoGenerationStartedPayload {
  request_id: string;
}

interface PhotoAnalysisPayload {
  photo_name: string;
}

type ServerMessageType =
  | "video_generation_started"
  | "photo_analysis_started"
  | "photo_analysis_completed";

interface ServerMessageEvent {
  type: ServerMessageType;
  payload: VideoGenerationStartedPayload | PhotoAnalysisPayload;
}

// Helper function to extract index from photo name (e.g., "image_0" -> 0)
const extractPhotoIndex = (photoName: string): number | null => {
  const match = photoName.match(/image_(\d+)/);
  return match ? parseInt(match[1], 10) : null;
};

export const ClientApp: React.FC<Props> = ({
  connect,
  disconnect,
  isMobile,
}) => {
  const client = usePipecatClient();

  const { isDisconnected } = usePipecatConnectionState();

  const [hasDisconnected, setHasDisconnected] = useState(false);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [uploadedPhotos, setUploadedPhotos] = useState<
    Array<{ filename: string; url: string }>
  >([]);
  const [videoRequestId, setVideoRequestId] = useState<string | null>(null);
  const [analyzingPhotoIndexes, setAnalyzingPhotoIndexes] = useState<
    Set<number>
  >(new Set());

  // Use the custom hook for video polling
  const {
    videoUrl,
    isPolling: isVideoPolling,
    error: videoError,
  } = useVideoPolling(videoRequestId);

  useRTVIClientEvent(
    RTVIEvent.ServerMessage,
    useCallback((event: ServerMessageEvent) => {
      console.log("Server message received:", event);
      switch (event?.type as ServerMessageType) {
        case "video_generation_started": {
          const videoGenerationStartedPayload =
            event?.payload as VideoGenerationStartedPayload;
          const requestId = videoGenerationStartedPayload.request_id;
          console.log("Video generation started with request ID:", requestId);
          setVideoRequestId(requestId);
          break;
        }
        case "photo_analysis_started": {
          const photoAnalysisStartedPayload =
            event?.payload as PhotoAnalysisPayload;
          const photoName = photoAnalysisStartedPayload.photo_name;
          console.log("Photo analysis started for photo:", photoName);

          const index = extractPhotoIndex(photoName);
          if (index !== null) {
            setAnalyzingPhotoIndexes((prev) => new Set(prev).add(index));
          }
          break;
        }
        case "photo_analysis_completed": {
          const photoAnalysisCompletedPayload =
            event?.payload as PhotoAnalysisPayload;
          const photoName = photoAnalysisCompletedPayload.photo_name;
          console.log("Photo analysis completed for photo:", photoName);

          const index = extractPhotoIndex(photoName);
          if (index !== null) {
            setAnalyzingPhotoIndexes((prev) => {
              const newSet = new Set(prev);
              newSet.delete(index);
              return newSet;
            });
          }
          break;
        }
      }
    }, [])
  );
  useEffect(() => {
    if (hasDisconnected) return;
    if (client && isDisconnected) {
      client.initDevices();
    }
  }, [client, hasDisconnected, isDisconnected]);

  // Capture room ID when client connects
  useEffect(() => {
    if (!client) return;

    const handleConnected = () => {
      // Access the Daily transport to get room information
      const transport = client.transport as {
        dailyCallObject?: {
          room?: () => { domainName?: string; name?: string };
        };
      };
      if (transport && transport.dailyCallObject) {
        const callObject = transport.dailyCallObject;
        if (callObject.room) {
          const roomInfo = callObject.room();
          const dailyRoomUrl = roomInfo.domainName || roomInfo.name || "";
          // Extract room ID from URL or use full room name
          const extractedRoomId = dailyRoomUrl.split("/").pop() || dailyRoomUrl;
          setRoomId(extractedRoomId);
          console.log("Daily room ID captured:", extractedRoomId);
        }
      }
    };

    // Listen for connection events
    client.on("connected", handleConnected);

    return () => {
      client.off("connected", handleConnected);
    };
  }, [client]);

  const handleDisconnect = async () => {
    await disconnect?.();
    setHasDisconnected(true);
  };

  const [showLogs, setShowLogs] = useState(false);
  const handleToggleLogs = () => {
    setShowLogs((prev) => !prev);
  };

  const handlePhotoUpload = (url: string, filename?: string) => {
    if (filename) {
      setUploadedPhotos((prev) => [...prev, { filename, url }]);
    }
  };

  const handleUploadComplete = (fileKey: string) => {
    client?.sendClientMessage("upload_complete", {
      type: "photo_upload",
      file_url: fileKey,
    });
  };

  if (!client) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4"></div>
          <p>Initializing...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-white flex flex-col">
      <header className="bg-white border-b border-gray-200 flex-shrink-0">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-4">
              <h1 className="text-xl font-semibold text-gray-900">
                Daily Diary 📔
              </h1>
            </div>
            {!hasDisconnected && (
              <div className="flex items-center gap-4">
                <Button
                  variant="outline"
                  onClick={handleDisconnect}
                  className="px-6 py-2 text-gray-900 border-gray-300 hover:bg-gray-50"
                >
                  Disconnect
                </Button>
                <Button
                  variant="outline"
                  onClick={handleToggleLogs}
                  className="px-4 py-2 text-gray-900 border-gray-300 hover:bg-gray-50"
                >
                  <Logs />
                </Button>
              </div>
            )}
          </div>
        </div>
      </header>

      {hasDisconnected ? (
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4">
              Disconnected. See you next time!
            </h1>
            <Button onClick={() => window.location.reload()}>
              Connect again
            </Button>
          </div>
        </main>
      ) : (
        <main className="flex-1 flex flex-col max-w-4xl mx-auto px-4 w-full">
          {/* Voice Transcript Area - Top of Screen */}
          <div className="flex-shrink-0 py-6">
            <div className="relative w-full">
              {/* Connection Status Indicator */}
              {!hasDisconnected && (
                <div className="absolute left-4 top-1/2 -translate-y-1/2 w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
              )}

              {/* Transcript Box */}
              <div className="border border-gray-300 rounded-lg p-6 pl-12 bg-white min-h-[120px] flex items-center">
                <CustomTranscriptOverlay
                  participant="remote"
                  className="w-full text-left pl-6"
                  size="lg"
                />
              </div>
            </div>
          </div>

          {/* Uploaded Photos List */}
          {uploadedPhotos.length > 0 && (
            <div className="flex-shrink-0 px-4 mb-4">
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <h3 className="text-sm font-medium text-gray-700 mb-2">
                  Uploaded Photos:
                </h3>
                <div className="space-y-1">
                  {uploadedPhotos.map((photo, index) => (
                    <div
                      key={index}
                      className="text-sm text-gray-600 flex items-center gap-2"
                    >
                      {analyzingPhotoIndexes.has(index) ? (
                        <>
                          <div className="w-2 h-2 border-2 border-blue-500 border-t-transparent rounded-full animate-spin flex-shrink-0"></div>
                          <span>
                            {photo.filename}{" "}
                            <span className="text-blue-600">
                              (Analyzing...)
                            </span>
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="w-2 h-2 bg-green-500 rounded-full flex-shrink-0"></span>
                          {photo.filename}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Generated Video Display */}
          {videoUrl && (
            <div className="flex-shrink-0 px-4 mb-4">
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <h3 className="text-sm font-medium text-gray-700 mb-3">
                  Generated Video:
                </h3>
                <VideoDisplay videoUrl={videoUrl} />
              </div>
            </div>
          )}

          {/* Video Generation Status */}
          {isVideoPolling && !videoUrl && (
            <div className="flex-shrink-0 px-4 mb-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-sm text-blue-700">
                    Generating video... This may take a few minutes.
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Video Generation Error */}
          {videoError && (
            <div className="flex-shrink-0 px-4 mb-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-red-700">
                    Video generation failed: {videoError}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Spacer to push components to bottom */}
          <div className="flex-1"></div>

          {/* Bottom Components - Fixed Section */}
          <div className="flex-shrink-0 border-t border-gray-200 pt-6 pb-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Controls Panel */}
              <Card>
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <UserAudioControl visualizerProps={{ barCount: 5 }} />
                    <PhotoUpload
                      onUpload={handlePhotoUpload}
                      onUploadComplete={handleUploadComplete}
                      roomId={roomId}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Event Logs Panel */}
              {showLogs && (
                <Card>
                  <CardContent className="p-4">
                    <h3 className="text-sm font-medium text-gray-700 mb-3">
                      Event Logs
                    </h3>
                    <div className="h-32 overflow-auto">
                      <EventStreamPanel />
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </main>
      )}
    </div>
  );
};
