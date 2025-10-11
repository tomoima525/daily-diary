"use client";

import { useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@pipecat-ai/voice-ui-kit";

interface PhotoUploadProps {
  onUpload: (url: string) => void;
  roomId: string | null;
}

export function PhotoUpload({ onUpload, roomId }: PhotoUploadProps) {
  const [uploading, setUploading] = useState(false);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      console.error("Please select an image file");
      return;
    }

    setUploading(true);
    console.log('Uploading file with room ID:', roomId);

    try {
      // Get presigned URL from server
      const response = await fetch("/api/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          filename: file.name,
          contentType: file.type,
          roomId: roomId
        }),
      });

      if (!response.ok) {
        throw new Error(`Upload preparation failed: ${response.status}`);
      }

      const { uploadUrl, fileUrl, key } = await response.json();

      // Upload file to S3 using presigned URL
      const uploadResponse = await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": file.type,
        },
      });

      if (!uploadResponse.ok) {
        throw new Error(`Upload to S3 failed: ${uploadResponse.status}`);
      }

      console.log(`File uploaded successfully: ${key}`);
      onUpload(fileUrl);
    } catch (error) {
      console.error("Upload failed:", error);
      // You could add user-facing error handling here
    } finally {
      setUploading(false);
    }
  };

  const handleButtonClick = () => {
    if (!uploading) {
      const input = document.getElementById('photo-upload') as HTMLInputElement;
      input?.click();
    }
  };

  return (
    <div className="relative">
      <input
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
        id="photo-upload"
        disabled={uploading}
      />
      <Button onClick={handleButtonClick} disabled={uploading}>
        <Upload className="w-4 h-4 mr-2" />
        {uploading ? "Uploading..." : "Upload Photo"}
      </Button>
    </div>
  );
}