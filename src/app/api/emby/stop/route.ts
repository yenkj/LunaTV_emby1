import { NextResponse } from 'next/server';
import { getEmbyClient } from '@/server/emby-manager'; 

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { PlaySessionId, MediaSourceId, ItemId, PositionTicks } = body;

    if (!PlaySessionId || !MediaSourceId || !ItemId || PositionTicks === undefined) {
      return NextResponse.json({ error: 'Missing required session parameters' }, { status: 400 });
    }

    const serverId = ItemId.split('-')[0];
    const embyClient = await getEmbyClient(parseInt(serverId)); 

    await embyClient.sendPlaybackStop(
      ItemId.split('-')[1], // 纯 Emby Item Id
      PlaySessionId,
      MediaSourceId,
      PositionTicks
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Emby stop API error:', error);
    return NextResponse.json({ error: 'Failed to send playback stop.' }, { status: 500 });
  }
}