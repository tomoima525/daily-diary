import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  const { requestId } = await params;
  
  if (!requestId) {
    return NextResponse.json(
      { error: "Request ID is required" },
      { status: 400 }
    );
  }

  const lambdaApiUrl = process.env.LAMBDA_API_URL;
  if (!lambdaApiUrl) {
    return NextResponse.json(
      { error: "LAMBDA_API_URL not configured" },
      { status: 500 }
    );
  }

  try {
    const response = await fetch(`${lambdaApiUrl}/video/${requestId}`, {
      method: "GET",
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Lambda API error: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error fetching video status:", error);
    return NextResponse.json(
      { error: "Failed to fetch video status" },
      { status: 500 }
    );
  }
}