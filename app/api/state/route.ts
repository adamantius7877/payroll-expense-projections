import { readAppState, writeAppState } from "@/lib/app-state-store";

export const runtime = "nodejs";

export async function GET() {
  try {
    const state = await readAppState();
    return Response.json({ state });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load saved state.";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const payload = await request.json();
    await writeAppState(payload);
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save state.";
    return Response.json({ error: message }, { status: 500 });
  }
}
