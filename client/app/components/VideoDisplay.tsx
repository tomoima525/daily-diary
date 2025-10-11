"use client";

export function VideoDisplay({ videoUrl }: { videoUrl: string | null }) {
  if (!videoUrl) return null;

  return (
    <div className="rounded-lg overflow-hidden shadow-lg">
      <video src={videoUrl} controls className="w-full" autoPlay />
    </div>
  );
}