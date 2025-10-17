"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { Button, Card, CardContent } from "@pipecat-ai/voice-ui-kit";
import Image from "next/image";

interface PhotoDisplayProps {
  photoUrl: string | null;
  onClear?: () => void;
  size?: 'thumbnail' | 'full';
  label?: string;
  isAnalyzing?: boolean;
}

export function PhotoDisplay({ 
  photoUrl, 
  onClear, 
  size = 'full',
  label,
  isAnalyzing = false 
}: PhotoDisplayProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setIsLoaded(false);
    setHasError(false);
  }, [photoUrl]);

  if (!photoUrl) {
    return null;
  }

  const sizeClasses = size === 'thumbnail' 
    ? "w-32 h-32" 
    : "w-full max-w-sm";
  
  const paddingClasses = size === 'thumbnail' ? "p-2" : "p-4";

  return (
    <Card className={sizeClasses}>
      <CardContent className={paddingClasses}>
        <div className="relative">
          <div className="relative w-full aspect-square bg-gray-100 rounded-lg overflow-hidden">
            {!hasError ? (
              <Image
                src={photoUrl}
                alt="Uploaded photo"
                fill
                className={`object-cover transition-opacity duration-200 ${
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
            
            {/* Analyzing overlay */}
            {isAnalyzing && (
              <div className="absolute inset-0 bg-blue-500 bg-opacity-20 flex items-center justify-center">
                <div className="bg-white rounded-full p-2 shadow-md">
                  <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
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
        {size === 'thumbnail' && label && (
          <p className="text-xs text-gray-600 mt-1 text-center truncate" title={label}>
            {isAnalyzing ? (
              <span className="text-blue-600">Analyzing...</span>
            ) : (
              label
            )}
          </p>
        )}
        {size === 'full' && (
          <p className="text-sm text-gray-600 mt-2 text-center">
            {hasError ? "Photo (Load Failed)" : label || "Uploaded Photo"}
          </p>
        )}
      </CardContent>
    </Card>
  );
}