import { NextRequest, NextResponse } from 'next/server';
import { getAuthInfoFromCookie } from '@/lib/auth'; // 假设的认证函数
import { getConfig } from '@/lib/config';       // 假设的配置函数
import { EmbyClient } from '@/lib/emby-client';    // 您的 EmbyClient 类

export const runtime = 'nodejs';

/**
 * 处理 Emby 停止播放请求
 */
export async function POST(request: NextRequest) {
  // 1. 验证用户身份
  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo || !authInfo.username || !authInfo.accessToken || !authInfo.userId) {
    return NextResponse.json({ error: 'Unauthorized or missing Emby credentials' }, { status: 401 });
  }

  try {
    const body = await request.json();
    // 注意：停止请求不需要 IsPaused
    const { PlaySessionId, MediaSourceId, ItemId, PositionTicks } = body; 

    if (!PlaySessionId || !MediaSourceId || !ItemId || PositionTicks === undefined) {
      return NextResponse.json({ error: 'Missing required session parameters' }, { status: 400 });
    }

    // 2. 解析 ItemId 获取服务器 ID
    const parts = ItemId.split('-');
    if (parts.length < 2) {
      return NextResponse.json({ error: 'Invalid ItemId format' }, { status: 400 });
    }

    const serverId = parseInt(parts[0]);
    const embyItemId = parts[1];

    // 3. 获取 Emby 服务器配置
    const config = await getConfig();
    const server = config.EmbyConfig?.find(s => s.id === serverId);

    if (!server) {
      return NextResponse.json({ error: 'Emby server not found' }, { status: 404 });
    }

    // 4. 创建 EmbyClient (直接使用已认证的 Token)
    const client = new EmbyClient({
      ...server, // 包含 ServerUrl 等配置
      accessToken: authInfo.accessToken, 
      userId: authInfo.userId,         
    });

    // 5. 🚀 调用 sendPlaybackStop 方法
    await client.sendPlaybackStop(
      embyItemId,
      PlaySessionId,
      MediaSourceId,
      PositionTicks
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Emby stop API error:', error);
    return NextResponse.json(
      { error: `Failed to send stop signal: ${error instanceof Error ? error.message : 'Unknown Error'}` },
      { status: 500 }
    );
  }
}