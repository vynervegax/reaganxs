import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  // Optional: Handle upload directly on edge before forwarding to Railway
  return NextResponse.json({ message: "Upload received" });
}