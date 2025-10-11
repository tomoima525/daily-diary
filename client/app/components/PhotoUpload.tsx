"use client";

import { useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@pipecat-ai/voice-ui-kit";

export function PhotoUpload({ onUpload }: { onUpload: (url: string) => void }) {
  const [uploading, setUploading] = useState(false);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);

    try {
      // Get presigned URL from server
      const response = await fetch("/api/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ filename: file.name }),
      });
      const { uploadUrl, fileUrl } = await response.json();

      // Upload to S3
      await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": file.type,
        },
      });

      onUpload(fileUrl);
    } catch (error) {
      console.error("Upload failed:", error);
    } finally {
      setUploading(false);
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
      <label htmlFor="photo-upload">
        <Button as="span" disabled={uploading}>
          <Upload className="w-4 h-4 mr-2" />
          {uploading ? "Uploading..." : "Upload Photo"}
        </Button>
      </label>
    </div>
  );
}