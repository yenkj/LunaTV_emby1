// src/lib/emby-client.ts

// ============ 接口定义 (保持不变) ============

interface EmbyConfig {
  id: number;
  name: string;
  url: string;
  username: string;
  password: string;
  userAgent?: string;
  order: number;
  disabled?: boolean;
}

interface EmbyAuthResponse {
  AccessToken: string;
  User: {
    Id: string;
    Name: string;
  };
}

interface EmbyItem {
  Id: string;
  Name: string;
  Type: string;
  CollectionType?: string;
  SeriesName?: string;
  SeriesId?: string;
  SeasonName?: string;
  IndexNumber?: number;
  ProductionYear?: number;
  CommunityRating?: number;
  Overview?: string;
  ImageTags?: {
    Primary?: string;
  };
  ParentId?: string;
}

interface EmbyMediaSource {
  Id: string;
  Name: string;
  DirectStreamUrl?: string;
  Url?: string;
  SupportsTranscoding?: boolean; 
  MediaStreams: Array<{
    Type: string;
    DisplayTitle?: string;
    Language?: string;
    Codec?: string;
    DeliveryUrl?: string;
  }>;
}

// ============ EmbyClient 类 ============

/**
 * Emby 客户端类,用于处理认证、媒体库浏览和媒体播放
 */
export class EmbyClient {
  private accessToken?: string;
  private userId?: string;
  private views?: EmbyItem[];
  // 统一的设备ID
  private readonly deviceId = 'lunatv-web'; 

  constructor(private config: EmbyConfig) {}

  /**
   * 用户名密码认证
   */
  async authenticate(): Promise<EmbyAuthResponse> {
    const params = new URLSearchParams({
      'X-Emby-Client': 'Emby Web',
      'X-Emby-Device-Name': 'LunaTV',
      'X-Emby-Device-Id': this.deviceId,
      'X-Emby-Client-Version': '1.0.0'
    });

    const body = new URLSearchParams({
      Username: this.config.username,
      Pw: this.config.password
    });

    const response = await fetch(
      `${this.config.url}/emby/Users/AuthenticateByName?${params}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': this.config.userAgent || 'LunaTV/1.0'
        },
        body: body.toString()
      }
    );

    if (!response.ok) {
      throw new Error(`Emby authentication failed: ${response.statusText}`);
    }

    const data: EmbyAuthResponse = await response.json();
    this.accessToken = data.AccessToken;
    this.userId = data.User.Id;

    // 获取媒体库视图
    const viewsResponse = await this.fetch(`/emby/Users/${this.userId}/Views`);
    this.views = viewsResponse.Items;

    return data;
  }

  /**
   * 生成 Authorization Header (已更新，包含固定的 DeviceId)
   */
  private getAuthHeader(): string {
    if (this.accessToken) {
      return `Emby UserId="${this.userId}", Client="LunaTV", Device="Web", DeviceId="${this.deviceId}", Version="1.0.0", Token="${this.accessToken}"`;
    }
    return '';
  }

  // --- 媒体库方法 (保持不变) ---
  async getFolderItems(folderId: string, page: number = 1) {  
  const limit = 20;  
  const startIndex = (page - 1) * limit;  
    
  const response = await this.fetch(  
    `/emby/Users/${this.userId}/Items?ParentId=${folderId}&StartIndex=${startIndex}&Limit=${limit}`  
  );  
    
  return {  
    list: response.Items.map((item: EmbyItem) => this.formatMovieDetail(item)),  
    page: page,  
    pagecount: Math.ceil(response.TotalRecordCount / limit)  
  };  
}
  async getViews(): Promise<EmbyItem[]> { /* ... */ }
  async getHomeContent() { /* ... */ }
  async getCategories() { /* ... */ }
  async getCategoryItems(categoryId: string, page: number = 1, sort?: string) { /* ... */ }
  async getItemDetail(itemId: string) { /* ... */ }
  async search(query: string, quick: boolean = false) { /* ... */ }

  // --- 播放方法 (关键修改) ---

/**
 * 播放信息 - 优化版本，强制使用 HLS 协议，支持视频直传/音频转码
 */
async getPlaybackInfo(itemId: string) {
    const parts = itemId.split('-');
    const embyItemId = parts[1];

    // 优化的 DeviceProfile (倾向于 Direct Stream + Audio Transcode + HLS)
    const deviceProfile = {
      SubtitleProfiles: [
        { Method: 'Embed', Format: 'ass' }, { Format: 'ssa', Method: 'Embed' },
        { Format: 'subrip', Method: 'Embed' }, { Format: 'sub', Method: 'Embed' },
        { Method: 'Embed', Format: 'pgssub' },
        { Format: 'subrip', Method: 'External' }, { Method: 'External', Format: 'sub' },
        { Method: 'External', Format: 'ass' }, { Format: 'ssa', Method: 'External' },
        { Method: 'External', Format: 'vtt' }
      ],
      MaxStreamingBitrate: 40000000, // 40 Mbps
      
      TranscodingProfiles: [{
        Container: 'ts',
        AudioCodec: 'aac,mp3', // 强制音频转码目标
        VideoCodec: 'h264,hevc,mpeg4',
        Context: 'Streaming',
        Protocol: 'hls', // 明确要求 HLS
        BreakOnNonKeyFrames: true,
        Type: 'Video',
        MaxAudioChannels: '6',
        MinSegments: 2
      }],
      
      DirectPlayProfiles: [{ 
        Container: 'mov,mp4,mkv,hls,webm', 
        Type: 'Video', 
        VideoCodec: 'h264,hevc,vp9', 
        AudioCodec: 'aac,mp3' 
      }],
      
      CodecProfiles: [{
        Type: 'Video',
        Conditions: [{
          Condition: 'LessThanEqual',
          Property: 'Width',
          Value: '1920'
        }]
      }]
    };

    // 1. POST PlaybackInfo
    // 修正: 移除 URL 中冗余或干扰的 MaxStreamingBitrate 参数
    const data = await this.fetch(
        `/emby/Items/${embyItemId}/PlaybackInfo?IsPlayback=false&AutoOpenLiveStream=false&StartTimeTicks=0&UserId=${this.userId}`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Emby-Device-Id': this.deviceId 
            },
            body: JSON.stringify({ DeviceProfile: deviceProfile })
        }
    );

    const playSessionId = data.PlaySessionId;
    const mediaSources: EmbyMediaSource[] = data.MediaSources;
    const urls: string[] = [];
    const subs: any[] = [];

    const targetSource = mediaSources[0];
    
    if (!targetSource || !targetSource.Id) {
        throw new Error("No valid media source found for playback.");
    }
    
    const mediaSourceId = targetSource.Id;
    
    // 2. 启动播放会话 (Progress 接口包含了 Start 功能)
    await this.sendPlaybackStart(embyItemId, playSessionId, mediaSourceId);

    // 3. 构造最终 M3U8 URL (最稳定且推荐的做法)
    const finalPlaybackUrl = `${this.config.url}/emby/videos/${embyItemId}/master.m3u8?${new URLSearchParams({
        'DeviceId': this.deviceId,
        'MediaSourceId': mediaSourceId,
        'api_key': this.accessToken || '',
        'PlaySessionId': playSessionId,
        'Static': 'true', 
        'StartTimeTicks': '0',
        'Container': deviceProfile.TranscodingProfiles[0].Container, // 'ts'
        'Protocol': deviceProfile.TranscodingProfiles[0].Protocol, // 'hls'
        'VideoCodec': deviceProfile.TranscodingProfiles[0].VideoCodec, // 'h264,hevc,mpeg4'
        'AudioCodec': deviceProfile.TranscodingProfiles[0].AudioCodec, // 'aac,mp3'
        'MaxStreamingBitrate': deviceProfile.MaxStreamingBitrate.toString(),
    }).toString()}`;

    urls.push(targetSource.Name);
    urls.push(finalPlaybackUrl); // 🚀 修正: 使用构造的 HLS URL

    // 提取字幕 (保持不变)
    for (const stream of targetSource.MediaStreams) {
        if (stream.Type === 'Subtitle' && stream.DeliveryUrl) {
            subs.push({
                name: stream.DisplayTitle || stream.Language || 'Subtitle',
                lang: stream.Language || 'unknown',
                format: stream.Codec === 'ass' ? 'text/x-ssa' : 'application/x-subrip',
                url: this.config.url + stream.DeliveryUrl
            });
        }
    }

    return {
        url: urls,
        subs: subs,
        header: { 'User-Agent': this.config.userAgent || 'LunaTV/1.0' },
        parse: 0,
        extra: {
            PlaySessionId: playSessionId,
            MediaSourceId: mediaSourceId,
            ItemId: embyItemId
        }
    };
}


/**
 * 启动播放会话 (Progress 接口包含了 Start 功能)
 * @private
 */
private async sendPlaybackStart(itemId: string, playSessionId: string, mediaSourceId: string) {
    const params = new URLSearchParams({
        'PlaySessionId': playSessionId,
        'MediaSourceId': mediaSourceId,
        'CanSeek': 'true',
        'IsPaused': 'false',
        'PositionTicks': '0',
        'PlaybackRate': '1',
        'ItemIds': itemId,
        'ClientName': 'LunaTV',
        'DeviceName': 'Web',
        'VolumeLevel': '100',
        'SubtitleStreamIndex': '-1',
        'AudioStreamIndex': '-1',
    });

    await this.fetch(`/emby/Sessions/Playing/Progress?${params}`, {
        method: 'POST',
        headers: {
            'X-Emby-Device-Id': this.deviceId // 使用统一的 DeviceId
        }
    });
}

/**
 * 发送播放进度(心跳)
 * @public
 */
public async sendPlaybackProgress(
    itemId: string,
    playSessionId: string,
    mediaSourceId: string,
    positionTicks: number = 0,
    isPaused: boolean = false
) {
    const params = new URLSearchParams({
        'PlaySessionId': playSessionId,
        'MediaSourceId': mediaSourceId,
        'PositionTicks': positionTicks.toString(),
        'IsPaused': isPaused.toString(),
        'PlaybackRate': '1',
        'ItemIds': itemId,
        'ClientName': 'LunaTV',
        'DeviceName': 'Web',
        'SubtitleStreamIndex': '-1',
        'AudioStreamIndex': '-1',
    });

    await this.fetch(`/emby/Sessions/Playing/Progress?${params}`, {
        method: 'POST',
        headers: {
            'X-Emby-Device-Id': this.deviceId
        }
    });
}

/**
 * 停止播放会话 (新增)
 * @public
 */
public async sendPlaybackStop(itemId: string, playSessionId: string, mediaSourceId: string, positionTicks: number = 0) {
    const params = new URLSearchParams({
        'PlaySessionId': playSessionId,
        'MediaSourceId': mediaSourceId,
        'PositionTicks': positionTicks.toString(),
        'ItemIds': itemId,
        'ClientName': 'LunaTV',
        'DeviceName': 'Web',
    });

    await this.fetch(`/emby/Sessions/Playing/Stopped?${params}`, {
        method: 'POST',
        headers: {
            'X-Emby-Device-Id': this.deviceId
        }
    });
}
  
  // --- 格式化和工具方法 (保持不变) ---
  
  private formatMovieDetail(item: EmbyItem) { /* ... */ }
  private formatSearchDetail(item: EmbyItem) { /* ... */ }
  private getImageUrl(item: EmbyItem): string | undefined { /* ... */ }

  /**
   * 通用 fetch 包装 (已更新，包含统一的 DeviceId)
   */
  private async fetch(path: string, options?: RequestInit): Promise<any> {
    const url = `${this.config.url}${path}`;
      
    const headers: HeadersInit = {
      'Authorization': this.getAuthHeader(),
      'User-Agent': this.config.userAgent || 'LunaTV/1.0',
      'X-Emby-Device-Id': this.deviceId, // 统一添加到所有请求头
      ...options?.headers
    };

    const response = await fetch(url, {
      ...options,
      headers
    });

    if (!response.ok) {
      // 抛出带有 URL 和响应体的错误，方便调试
      let errorText = await response.text();
      console.error(`Emby API Error on ${url}: ${response.status} ${response.statusText}`, errorText);
      throw new Error(`Emby API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }
}
