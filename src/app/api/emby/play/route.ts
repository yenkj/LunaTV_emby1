import { NextRequest, NextResponse } from 'next/server';  
import { getAuthInfoFromCookie } from '@/lib/auth';  
import { getConfig } from '@/lib/config';  
import { EmbyClient } from '@/lib/emby-client';  
  
export const runtime = 'nodejs';  
  
export async function GET(request: NextRequest) {  
  const authInfo = getAuthInfoFromCookie(request);  
  if (!authInfo || !authInfo.username) {  
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });  
  }  
  
  const { searchParams } = new URL(request.url);  
  const id = searchParams.get('id');  
  
  if (!id) {  
    return NextResponse.json({ error: '缺少 id 参数' }, { status: 400 });  
  }  
  
  try {  
    // 解析 ID: {serverId}-{embyItemId}  
    const parts = id.split('-');  
    if (parts.length < 2) {  
      return NextResponse.json({ error: 'ID 格式错误' }, { status: 400 });  
    }  
  
    const serverId = parseInt(parts[0]);  
    const config = await getConfig();  
    const server = config.EmbyConfig?.find(s => s.id === serverId);  
  
    if (!server) {  
      return NextResponse.json({ error: '未找到 Emby 服务器' }, { status: 404 });  
    }  
  
    const client = new EmbyClient(server);  
    await client.authenticate();  
  
    const result = await client.getPlaybackInfo(id);  
    return NextResponse.json(result);  
  } catch (error) {  
    console.error('获取播放信息失败:', error);  
    return NextResponse.json(  
      { error: error instanceof Error ? error.message : '获取播放信息失败' },  
      { status: 500 }  
    );  
  }  
}
