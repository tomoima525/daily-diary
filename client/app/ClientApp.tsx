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
import { PhotoUpload } from './components/PhotoUpload';
import { VideoDisplay } from './components/VideoDisplay';
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
      const transport = client.transport as { dailyCallObject?: { room?: () => { domainName?: string; name?: string } } };
      if (transport && transport.dailyCallObject) {
        const callObject = transport.dailyCallObject;
        if (callObject.room) {
          const roomInfo = callObject.room();
          const dailyRoomUrl = roomInfo.domainName || roomInfo.name || '';
          // Extract room ID from URL or use full room name
          const extractedRoomId = dailyRoomUrl.split('/').pop() || dailyRoomUrl;
          setRoomId(extractedRoomId);
          console.log('Daily room ID captured:', extractedRoomId);
        }
      }
    };

    // Listen for connection events
    client.on('connected', handleConnected);
    
    return () => {
      client.off('connected', handleConnected);
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
    client?.sendClientMessage("Test message", {
      type: "client_message",
      url: "https://www.google.com",
    });
    setShowLogs((prev) => !prev);
  };

  const handlePhotoUpload = (url: string) => {
    client?.sendClientMessage('photo_uploaded', {
      type: 'photo_upload',
      url: url,
      roomId: roomId,
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
              <Image src="/pipecat.svg" alt="Pipecat" width={32} height={32} />
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
                Pipecat + Gemini + Voice UI Kit
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
          <ResizablePanelGroup direction="vertical" className="h-full gap-2">
            <ResizablePanel defaultSize={70} minSize={40}>
              {/* Small screens: resizable split between conversation and screenshare */}
              <div className="lg:hidden! h-full">
                <Panel className="h-full">
                  <PanelHeader>
                    <PanelTitle>Conversation</PanelTitle>
                  </PanelHeader>
                  <PanelContent className="h-full p-0! min-h-0">
                    <div className="flex flex-col h-full">
                      <div className="flex-1">
                        <Conversation
                          assistantLabel="Gemini"
                          clientLabel="You"
                          textMode="tts"
                        />
                      </div>
                      <VideoDisplay videoUrl={videoUrl} />
                    </div>
                  </PanelContent>
                </Panel>
              </div>

              {/* Large screens: resizable split between conversation and screenshare */}
              <div className="hidden lg:block! h-full">
                <ResizablePanelGroup
                  direction="horizontal"
                  className="h-full gap-2"
                >
                  <ResizablePanel defaultSize={100} minSize={30}>
                    <Panel className="h-full">
                      <PanelHeader>
                        <PanelTitle>Conversation</PanelTitle>
                      </PanelHeader>
                      <PanelContent className="h-full p-0! min-h-0">
                        <div className="flex flex-col h-full">
                          <div className="flex-1">
                            <Conversation
                              assistantLabel="Gemini"
                              clientLabel="You"
                              textMode="tts"
                            />
                          </div>
                          <VideoDisplay videoUrl={videoUrl} />
                        </div>
                      </PanelContent>
                    </Panel>
                  </ResizablePanel>
                </ResizablePanelGroup>
              </div>
            </ResizablePanel>
            <ResizableHandle className={cn({ hidden: !showLogs })} withHandle />
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
                <PhotoUpload onUpload={handlePhotoUpload} roomId={roomId} />
              </CardContent>
            </Card>
          </div>

          <div
            className={cn(
              "fixed bottom-8 right-8 w-64 rounded-xl overflow-hidden transition-all origin-bottom-right bg-white shadow-gray-600 shadow-md",
              {
                "opacity-0 scale-0": !isCamEnabled,
                "opacity-100 scale-100": isCamEnabled,
              }
            )}
          >
            <PipecatClientVideo participant="local" trackType="video" />
          </div>

          {isMobile && (
            <div className="mt-8">
              <Card className="border-yellow-200 bg-yellow-50 dark:bg-yellow-900/20">
                <CardContent className="pt-6">
                  <div className="flex items-center space-x-2 text-yellow-800 dark:text-yellow-200">
                    <MonitorOff className="h-5 w-5" />
                    <p className="font-medium">
                      Screen sharing is not available on mobile devices
                    </p>
                  </div>
                  <p className="text-sm text-yellow-700 dark:text-yellow-300 mt-1">
                    Please use a desktop browser to access screen sharing
                    features.
                  </p>
                </CardContent>
              </Card>
            </div>
          )}
        </main>
      )}
    </div>
  );
};
