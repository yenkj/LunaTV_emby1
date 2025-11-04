import { NextRequest, NextResponse } from 'next/server';  
import { getAuthInfoFromCookie } from '@/lib/auth';  
import { getConfig } from '@/lib/config';  
import { EmbyClient } from '@/lib/emby-client';  
  
export const runtime = 'nodejs';  
  
/**  
 * 处理 Emby 播放进度/心跳请求  
 */  
export async function POST(request: NextRequest) {  
// 1. 验证用户身份
const authInfo = getAuthInfoFromCookie(request);
if (!authInfo || !authInfo.username || !authInfo.accessToken || !authInfo.userId) { // 🚀 确保 authInfo 包含 Emby Token
    return NextResponse.json({ error: 'Unauthorized or missing Emby credentials' }, { status: 401 });
}

try {
    // ... (Body 解析和 ItemId 解析保持不变)
    
    // ... (步骤 3: 获取 Emby 服务器配置保持不变)
    
    // 4. 🚀 修正：直接使用已有的 AccessToken 和 UserId 实例化 EmbyClient
    const client = new EmbyClient({
        ...server, // 包含 ServerUrl 等配置
        accessToken: authInfo.accessToken, // 从 authInfo 中获取 Token
        userId: authInfo.userId,           // 从 authInfo 中获取 UserId
        // 确保您的 EmbyClient 构造函数能够接受这些属性
    });
    
    // ⚠️ 移除 client.authenticate();

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