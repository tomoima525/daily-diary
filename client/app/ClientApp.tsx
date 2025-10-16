"use client";

import {
  PipecatClientVideo,
  usePipecatClient,
  usePipecatClientCamControl,
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
  usePipecatConnectionState,
  UserAudioControl,
  UserScreenControl,
  UserVideoControl,
} from "@pipecat-ai/voice-ui-kit";
import React, { useEffect, useState } from "react";
import { Logs, MonitorOff } from "lucide-react";
import { EventStreamPanel } from "./EventStreamPanel";
import { PhotoUpload } from "./components/PhotoUpload";
import { VideoDisplay } from "./components/VideoDisplay";
import { PhotoDisplay } from "./components/PhotoDisplay";
import Image from "next/image";

interface Props {
  connect?: () => void | Promise<void>;
  disconnect?: () => void | Promise<void>;
  isMobile: boolean;
}

export const ClientApp: React.FC<Props> = ({
  connect,
  disconnect,
  isMobile,
}) => {
  const client = usePipecatClient();

  const { isDisconnected } = usePipecatConnectionState();
  const { isCamEnabled } = usePipecatClientCamControl();

  const [hasDisconnected, setHasDisconnected] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [uploadedPhotoUrl, setUploadedPhotoUrl] = useState<string | null>(null);

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

  const handleConnect = async () => {
    try {
      connect?.();
    } catch (error) {
      console.error("Connection error:", error);
    }
  };

  const handleDisconnect = async () => {
    setHasDisconnected(true);
    disconnect?.();
  };

  const [showLogs, setShowLogs] = useState(false);
  const handleToggleLogs = () => {
    setShowLogs((prev) => !prev);
  };

  const handlePhotoUpload = (url: string) => {
    setUploadedPhotoUrl(url);
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
    <div
      className="min-h-screen bg-gray-50 dark:bg-gray-900"
      style={
        {
          "--controls-height": "144px",
          "--header-height": "97px",
        } as React.CSSProperties
      }
    >
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-4">
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
                Daily Diary 📔
              </h1>
            </div>
            {!hasDisconnected && (
              <div className="flex items-center gap-4">
                <ConnectButton
                  onConnect={handleConnect}
                  onDisconnect={handleDisconnect}
                />
                <Button
                  variant={showLogs ? "primary" : "outline"}
                  onClick={handleToggleLogs}
                  title={showLogs ? "Hide logs" : "Show logs"}
                >
                  <Logs />
                </Button>
              </div>
            )}
          </div>
        </div>
      </header>

      {hasDisconnected ? (
        <main className="relative max-w-7xl mx-auto mt-8 px-4 h-[calc(100vh-var(--header-height))] overflow-hidden">
          <div className="h-full flex flex-col items-center justify-center gap-4 text-center">
            <h1 className="text-2xl font-bold">
              Disconnected. See you next time!
            </h1>
            <Button onClick={() => window.location.reload()}>
              Connect again
            </Button>
          </div>
        </main>
      ) : (
        <main className="relative max-w-7xl mx-auto mt-8 px-4 h-[calc(100vh-var(--header-height)-var(--controls-height))] overflow-hidden">
          <ResizablePanelGroup direction="horizontal">
            <ResizablePanel
              defaultSize={30}
              minSize={20}
              className={cn("min-h-0", { hidden: !showLogs })}
            >
              <EventStreamPanel />
            </ResizablePanel>
          </ResizablePanelGroup>
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2">
            <Card>
              <CardContent className="flex items-center justify-center gap-2">
                <UserAudioControl visualizerProps={{ barCount: 5 }} />
                <UserVideoControl noVideo />
                {!isMobile && <UserScreenControl noScreen />}
                <PhotoUpload
                  onUpload={handlePhotoUpload}
                  onUploadComplete={handleUploadComplete}
                  roomId={roomId}
                />
              </CardContent>
            </Card>
          </div>
        </main>
      )}
    </div>
  );
};
