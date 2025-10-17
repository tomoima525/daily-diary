"use client";

import { ConnectButton } from "@pipecat-ai/voice-ui-kit";

interface LandingPageProps {
  onConnect: (() => void | Promise<void>) | undefined;
  onDisconnect: (() => void | Promise<void>) | undefined;
}

export function LandingPage({ onConnect, onDisconnect }: LandingPageProps) {
  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-4">
      <div className="text-center max-w-md mx-auto">
        <h1 className="text-6xl font-bold text-gray-900 mb-6">
          Daily Diary 📔
        </h1>
        <p className="text-xl text-gray-700 mb-12">
          Talk, and your day turns into a memory movie✨
        </p>
        <div className="flex justify-center">
          <ConnectButton onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </div>
    </div>
  );
}
