import { NextResponse } from 'next/server';
// 假设您的客户端管理模块
import { getEmbyClient } from '@/server/emby-manager'; 

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { PlaySessionId, MediaSourceId, ItemId, PositionTicks, IsPaused } = body;

    // 检查参数
    if (!PlaySessionId || !MediaSourceId || !ItemId || PositionTicks === undefined || IsPaused === undefined) {
      return NextResponse.json({ error: 'Missing required session parameters' }, { status: 400 });
    }

    // 从 ItemId (格式如: 1-{embyItemId}) 中提取 serverId
    const serverId = ItemId.split('-')[0]; 
    const embyClient = await getEmbyClient(parseInt(serverId)); 

    await embyClient.sendPlaybackProgress(
      ItemId.split('-')[1], // 纯 Emby Item Id
      PlaySessionId,
      MediaSourceId,
      PositionTicks,
      IsPaused
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Emby progress API error:', error);
    return NextResponse.json({ error: 'Failed to send playback progress.' }, { status: 500 });
  }
}