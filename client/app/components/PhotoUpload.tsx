"use client";

import { useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@pipecat-ai/voice-ui-kit";

interface PhotoUploadProps {
  onUpload: (url: string, filename?: string) => void;
  onUploadComplete?: (fileKey: string) => void;
  roomId: string | null;
}

export function PhotoUpload({ onUpload, onUploadComplete, roomId }: PhotoUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const uploadFile = async (file: File) => {
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
      onUpload(fileUrl, file.name);

      // Notify agent that upload is complete
      if (onUploadComplete) {
        onUploadComplete(key);
      }
    } catch (error) {
      console.error("Upload failed:", error);
      // You could add user-facing error handling here
    } finally {
      setUploading(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Upload files sequentially
    for (let i = 0; i < files.length; i++) {
      await uploadFile(files[i]);
    }

    // Reset the input value to allow uploading the same file again
    e.target.value = '';
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);

    // Filter for image files only
    const imageFiles = files.filter(file => file.type.startsWith('image/'));

    if (imageFiles.length === 0) {
      console.error("No image files found in drop");
      return;
    }

    // Upload files sequentially
    for (const file of imageFiles) {
      await uploadFile(file);
    }
  };

  const handleButtonClick = () => {
    if (!uploading) {
      const input = document.getElementById('photo-upload') as HTMLInputElement;
      input?.click();
    }
  };

  return (
    <div className="relative w-full">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          relative transition-all duration-200 rounded-lg p-8
          border-2 border-dashed
          flex flex-col items-center justify-center gap-3
          ${isDragging
            ? 'bg-blue-500/20 border-blue-500 scale-[1.02]'
            : 'bg-gray-500/5 border-gray-300 hover:border-blue-400 hover:bg-blue-500/5'
          }
        `}
      >
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileSelect}
          className="hidden"
          id="photo-upload"
          disabled={uploading}
        />

        <Upload className={`w-8 h-8 ${isDragging ? 'text-blue-500' : 'text-gray-400'}`} />

        <div className="text-center">
          <p className={`text-sm font-medium mb-1 ${isDragging ? 'text-blue-500' : 'text-gray-700'}`}>
            {isDragging ? 'Drop images here!' : 'Drag & drop images here'}
          </p>
          <p className="text-xs text-gray-500">or</p>
        </div>

        <Button onClick={handleButtonClick} disabled={uploading}>
          <Upload className="w-4 h-4 mr-2" />
          {uploading ? "Uploading..." : "Browse Files"}
        </Button>
      </div>
    </div>
  );
}