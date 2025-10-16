"use client";

import { useState, useEffect } from "react";
import {
  PipecatAppBase,
  usePipecatConnectionState,
} from "@pipecat-ai/voice-ui-kit";

import { ClientApp } from "./ClientApp";
import { LandingPage } from "./components/LandingPage";

import "@pipecat-ai/voice-ui-kit/styles.scoped";

function AppContent({
  handleConnect,
  handleDisconnect,
  isMobile,
}: {
  handleConnect: (() => void | Promise<void>) | undefined;
  handleDisconnect: (() => void | Promise<void>) | undefined;
  isMobile: boolean;
}) {
  const { isConnected } = usePipecatConnectionState();

  if (!isConnected) {
    return (
      <div className="vkui-root">
        <div className="voice-ui-kit">
          <LandingPage
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="vkui-root">
      <div className="voice-ui-kit">
        <ClientApp
          connect={handleConnect}
          disconnect={handleDisconnect}
          isMobile={isMobile}
        />
      </div>
    </div>
  );
}

export default function Home() {
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile devices
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
          navigator.userAgent
        )
      );
    };
    checkMobile();
  }, []);

  return (
    <PipecatAppBase
      transportType="daily"
      connectParams={{
        endpoint: "/api/start",
      }}
    >
      {({ handleConnect, handleDisconnect }) => (
        <AppContent
          handleConnect={handleConnect}
          handleDisconnect={handleDisconnect}
          isMobile={isMobile}
        />
      )}
    </PipecatAppBase>
  );
}
