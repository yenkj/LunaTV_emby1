import { NextRequest, NextResponse } from 'next/server';  
import { getAuthInfoFromCookie } from '@/lib/auth';  
import { getConfig } from '@/lib/config';  
import { EmbyClient } from '@/lib/emby-client';  
  
export const runtime = 'nodejs';  
  
/**  
 * 处理 Emby 播放进度/心跳请求  
 */  
export async function POST(request: NextRequest) {  
  // 1. 验证用户身份(只检查基本认证)  
  const authInfo = getAuthInfoFromCookie(request);  
  if (!authInfo || !authInfo.username) {  
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });  
  }  
  
  try {  
    const body = await request.json();  
    const { PlaySessionId, MediaSourceId, ItemId, PositionTicks, IsPaused } = body;  
  
    if (!PlaySessionId || !MediaSourceId || !ItemId || PositionTicks === undefined) {  
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });  
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
  
    // 4. 创建 EmbyClient 并认证  
    const client = new EmbyClient(server);  
    await client.authenticate();  
  
    // 5. 发送播放进度  
    await client.sendPlaybackProgress(  
      embyItemId,  
      PlaySessionId,  
      MediaSourceId,  
      PositionTicks,  
      IsPaused  
    );  
  
    return NextResponse.json({ success: true });  
  } catch (error) {  
    console.error('Emby progress API error:', error);  
    return NextResponse.json(  
      { error: `Failed to send progress: ${error instanceof Error ? error.message : 'Unknown Error'}` },  
      { status: 500 }  
    );  
  }  
}
