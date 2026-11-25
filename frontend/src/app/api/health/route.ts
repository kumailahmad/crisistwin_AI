import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ status: "ok", database: "in-memory", version: "0.2.0" });
}
