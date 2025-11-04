/**
 * Emby 客户端类，用于处理认证、媒体库浏览和媒体播放
 */
export class EmbyClient {
    private accessToken?: string;
    private userId?: string;
    private views?: EmbyItem[];

    // --- 接口定义（为保持完整性保留，但建议单独放在一个文件） ---

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
        SupportsTranscoding: boolean; // 新增，用于判断是否转码
        MediaStreams: Array<{
            Type: string;
            DisplayTitle?: string;
            Language?: string;
            Codec?: string;
            DeliveryUrl?: string;
        }>;
    }
    
    // -----------------------------------------------------------------
    
    constructor(private config: EmbyConfig) {}

    /**
     * 用户名密码认证 - 对应 getEmbyInfo()
     */
    async authenticate(): Promise<EmbyAuthResponse> {
        const params = new URLSearchParams({
            'X-Emby-Client': 'Emby Web',
            'X-Emby-Device-Name': 'LunaTV',
            'X-Emby-Device-Id': 'lunatv-' + Date.now(),
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
     * 生成 Authorization Header
     */
    private getAuthHeader(): string {
        // 使用 Token 替代完整的 Authorization Header，方便 M3U8 链接直接使用
        if (this.accessToken) {
             return `Emby UserId="${this.userId}", Client="LunaTV", Device="Web", DeviceId="lunatv-web", Version="1.0.0", Token="${this.accessToken}"`;
        }
        return '';
    }

    /**
     * 通用 fetch 包装 - 支持 GET 和 POST
     */
    private async fetch(path: string, options?: RequestInit): Promise<any> {
        const url = `${this.config.url}${path}`;
        
        const headers: HeadersInit = {
            'Authorization': this.getAuthHeader(),
            'User-Agent': this.config.userAgent || 'LunaTV/1.0',
            ...options?.headers
        };

        const response = await fetch(url, {
            ...options,
            headers
        });

        if (!response.ok) {
            throw new Error(`Emby API error: ${response.status} ${response.statusText} URL: ${url}`);
        }

        return response.json();
    }

    // （省略 getViews, getHomeContent, getCategories, getFolderItems, getCategoryItems, getItemDetail, search, formatMovieDetail, formatSearchDetail, getImageUrl 等其他辅助方法，它们保持原样）

    // --- 核心播放逻辑修改区域 ---

    /**
     * 播放信息 - 对应 play()
     * 1. POST PlaybackInfo 获取服务器转码决策。
     * 2. POST Sessions/Playing/Progress 启动播放会话和转码进程。
     * 3. 构造 M3U8 链接。
     */
    async getPlaybackInfo(itemId: string) {
        const parts = itemId.split('-');
        const embyItemId = parts[1];

        // 🎯 优化：DeviceProfile 配置，强制要求 HLS 且 Audio Codec 为 AAC/MP3
        const deviceProfile = {
            // ... (其他保持不变的配置)
            SubtitleProfiles: [
                { Method: 'Embed', Format: 'ass' },
                // ... (省略其他字幕配置)
            ],
            MaxStreamingBitrate: 40000000,
            TranscodingProfiles: [{
                Container: 'ts',
                AudioCodec: 'aac,mp3', // 仅允许AAC/MP3作为转码目标音频
                VideoCodec: 'h264,hevc,mpeg4',
                Context: 'Streaming',
                Protocol: 'hls',
                // 关键参数：启用 Direct Stream，让服务器倾向于只转码音频
                // Emby 会尝试 Direct Stream (视频拷贝，音频转码)
            }],
            DirectPlayProfiles: [{
                Container: 'mov,mp4,mkv,hls,webm',
                Type: 'Video',
                // 确保浏览器支持的视频/音频格式能够 Direct Play
                VideoCodec: 'h264,hevc,vp9',
                AudioCodec: 'aac,mp3' // 浏览器可原生播放的音频
            }]
        };

        // 1. POST PlaybackInfo
        const data = await this.fetch(
            `/emby/Items/${embyItemId}/PlaybackInfo?IsPlayback=false&AutoOpenLiveStream=false&StartTimeTicks=0&MaxStreamingBitrate=2147483647&UserId=${this.userId}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ DeviceProfile: deviceProfile })
            }
        );

        const playSessionId = data.PlaySessionId;
        const mediaSources: EmbyMediaSource[] = data.MediaSources;
        const urls: string[] = [];
        const subs: Array<{ name: string; lang: string; format: string; url: string; }> = [];

        // 🎯 查找转码或直连的 MediaSource
        const targetSource = mediaSources.find(s => s.SupportsTranscoding) || mediaSources[0];
        
        if (!targetSource) {
             throw new Error("No media source found for playback.");
        }
        
        const mediaSourceId = targetSource.Id;
        
        // 2. POST Sessions/Playing/Progress (启动播放会话/心跳)
        // 这一步是关键！它通知服务器启动转码。
        await this.sendPlaybackStart(embyItemId, playSessionId, mediaSourceId);

        // 3. 构造 M3U8 播放链接
        // 注意：HLS/转码链接需要 PlaySessionId 和 MediaSourceId
        const finalPlaybackUrl = this.config.url + `/emby/videos/${embyItemId}/master.m3u8?` + new URLSearchParams({
            // 认证信息
            'DeviceId': 'lunatv-web',
            'api_key': this.accessToken || '',
            // 播放会话信息
            'MediaSourceId': mediaSourceId,
            'PlaySessionId': playSessionId,
            // 转码参数（确保与 DeviceProfile 匹配，Emby 会使用这些参数）
            'VideoCodec': 'h264,hevc', 
            'AudioCodec': 'aac',
            'MaxAudioChannels': '6',
            'Tag': targetSource.MediaStreams.find(s => s.Type === 'Video')?.Codec || '', // 视频Tag
            'VideoBitrate': '40000000',
            'MaxFramerate': '60',
            'StartTimeTicks': '0',
            'Static': 'true', // Emby/Jellyfin 网页端播放常用参数
        }).toString();


        urls.push(targetSource.Name);
        urls.push(finalPlaybackUrl);

        // 提取字幕
        for (const stream of targetSource.MediaStreams) {
            if (stream.Type === 'Subtitle' && stream.DeliveryUrl) {
                subs.push({
                    name: stream.DisplayTitle || stream.Language || 'Subtitle',
                    lang: stream.Language || 'unknown',
                    format: stream.Codec === 'ass' ? 'text/x-ssa' : 'application/x-subrip',
                    url: this.config.url + stream.DeliveryUrl + `?api_key=${this.accessToken}` // 字幕也需要认证
                });
            }
        }

        return {
            url: urls,
            subs: subs,
            // 播放链接已经包含了 api_key，但为了保险，仍可以发送 User-Agent
            header: { 'User-Agent': this.config.userAgent || 'LunaTV/1.0' },
            parse: 0,
            // 💡 必须返回 PlaySessionId 和 MediaSourceId，供心跳使用！
            extra: {
                PlaySessionId: playSessionId,
                MediaSourceId: mediaSourceId
            }
        };
    }

    /**
     * 【新增】启动播放会话/发送第一次心跳
     * 通知服务器播放已开始，启动转码进程。
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

        // 使用 POST /Sessions/Playing/Progress 接口作为播放开始标记
        await this.fetch(`/emby/Sessions/Playing/Progress?${params}`, {
            method: 'POST',
        });
    }

    /**
     * 【新增】持续发送播放进度（心跳）
     * 保持转码进程活跃。
     * ！！！注意：这个方法需要在您的播放器前端代码中循环调用！！！
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
        });
    }
}