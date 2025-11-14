"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { Button, Card, CardContent } from "@pipecat-ai/voice-ui-kit";
import Image from "next/image";

interface PhotoDisplayProps {
  photoUrl: string | null;
  onClear?: () => void;
  isAnalyzing?: boolean;
}

export function PhotoDisplay({ photoUrl, onClear }: PhotoDisplayProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  console.log("======", photoUrl);
  useEffect(() => {
    setIsLoaded(false);
    setHasError(false);
  }, [photoUrl]);

  if (!photoUrl) {
    return null;
  }

  return (
    <>
      <div className="w-full max-w-[200px]">
        <div className="relative w-full min-h-[150px] max-h-[300px] bg-gray-100 rounded-lg overflow-hidden flex items-center justify-center">
          {!hasError ? (
            <Image
              src={photoUrl}
              alt="Uploaded photo"
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, 33vw"
              className={`object-contain transition-opacity duration-200 ${
                isLoaded ? "opacity-100" : "opacity-0"
              }`}
              onLoad={() => setIsLoaded(true)}
              onError={() => setHasError(true)}
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500">
              <div className="text-4xl mb-2">📷</div>
              <div className="text-sm text-center px-2">
                Failed to load image
              </div>
            </div>
          )}
          {!isLoaded && !hasError && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
            </div>
          )}
        </div>
        {onClear && (
          <Button
            variant="outline"
            size="sm"
            className="absolute -top-2 -right-2 h-6 w-6 p-0 rounded-full bg-white shadow-md"
            onClick={onClear}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      <p className="text-sm text-gray-600 mt-2 text-center">
        {hasError && "Photo (Load Failed)"}
      </p>
    </>
  );
}
