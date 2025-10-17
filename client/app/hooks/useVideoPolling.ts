"use client";

import { useState, useEffect } from "react";

// Custom hook for video polling
export const useVideoPolling = (requestId: string | null) => {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!requestId) {
      setVideoUrl(null);
      setIsPolling(false);
      setError(null);
      return;
    }

    setIsPolling(true);
    setError(null);
    let intervalId: NodeJS.Timeout | null = null;

    const pollVideoGenerationStatus = async () => {
      try {
        const response = await fetch(`/api/video/${requestId}`);
        const data = await response.json();
        console.log("Video generation status:", data);

        if (data.isReady && data.videoKey) {
          // Get presigned URL for the video
          const presignedResponse = await fetch(
            `/api/video/presigned?videoKey=${encodeURIComponent(data.videoKey)}`
          );
          const presignedData = await presignedResponse.json();

          if (presignedData.presignedUrl) {
            setVideoUrl(presignedData.presignedUrl);
            setIsPolling(false);
            
            // CRITICAL FIX: Clear the interval when video is ready
            if (intervalId) {
              clearInterval(intervalId);
              intervalId = null;
            }
          }
        }
      } catch (error) {
        console.error("Error polling video status:", error);
        setError(error instanceof Error ? error.message : "Unknown error");
        setIsPolling(false);
        
        // Clear interval on error too
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
      }
    };

    // Start polling every 5 seconds
    intervalId = setInterval(pollVideoGenerationStatus, 5000);

    // Also check immediately
    pollVideoGenerationStatus();
    
    // Cleanup function
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [requestId]); // REMOVED isPolling dependency to prevent infinite re-renders

  return { videoUrl, isPolling, error };
};
