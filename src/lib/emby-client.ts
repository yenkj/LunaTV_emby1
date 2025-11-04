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
  CollectionType?: string;  // 添加这一行  
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
}  
  
interface EmbyMediaSource {  
  Name: string;  
  DirectStreamUrl?: string;  
  Url?: string;  
  MediaStreams: Array<{  
    Type: string;  
    DisplayTitle?: string;  
    Language?: string;  
    Codec?: string;  
    DeliveryUrl?: string;  
  }>;  
}  
  
export class EmbyClient {  
  private accessToken?: string;  
  private userId?: string;  
  private views?: EmbyItem[];  
  
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
    return `Emby UserId="${this.userId}", Client="LunaTV", Device="Web", DeviceId="lunatv-web", Version="1.0.0", Token="${this.accessToken}"`;  
  }  
  
  /**  
   * 通用 fetch 包装  
   */  
  
  /**  
   * 获取媒体库视图 - 对应 category()  
   */  
  async getViews(): Promise<EmbyItem[]> {  
    if (this.views) {  
      return this.views;  
    }  
    const data = await this.fetch(`/emby/Users/${this.userId}/Views`);  
    this.views = data.Items;  
    return this.views || [];  // 添加默认值   
  }  
  
  /**  
   * 首页内容 - 对应 home()  
   */  
  async getHomeContent() {  
    // 1. 继续观看  
    const resumeData = await this.fetch(  
      `/emby/Users/${this.userId}/Items/Resume?Limit=12&Recursive=true&Fields=PrimaryImageAspectRatio,BasicSyncInfo,ProductionYear,CommunityRating&ImageTypeLimit=1&EnableImageTypes=Primary,Backdrop,Thumb&EnableTotalRecordCount=false&MediaTypes=Video`  
    );  
  
    const list: any[] = resumeData.Items.map((item: EmbyItem) => this.formatMovieDetail(item));  
  
    // 2. 每个媒体库的最新内容  
    const views = await this.getViews();  
    for (const view of views) {  
      const latestData = await this.fetch(  
        `/emby/Users/${this.userId}/Items/Latest?Limit=12&Fields=PrimaryImageAspectRatio,BasicSyncInfo,ProductionYear,CommunityRating&ImageTypeLimit=1&EnableImageTypes=Primary,Backdrop,Thumb&ParentId=${view.Id}`  
      );  
      list.push(...latestData.map((item: EmbyItem) => this.formatMovieDetail(item)));  
    }  
  
    return {  
      list,  
      total: list.length,  
      limit: list.length  
    };  
  }  
  
  /**  
   * 分类列表 - 对应 category()  
   */  
  async getCategories() {  
    const views = await this.getViews();  
    const categories = views.map((view, index) => ({  
      type_id: `${this.config.id}-${index}`,  
      type_name: `${this.config.name}:${view.Name}`,  
      type_flag: 0  
    }));  
  
    // 排序过滤器  
    const filters = [  
      { n: '评分⬆️', v: 'CommunityRating,SortName:Ascending' },  
      { n: '评分⬇️', v: 'CommunityRating,SortName:Descending' },  
      { n: '发行日期⬆️', v: 'PremiereDate,ProductionYear,SortName:Ascending' },  
      { n: '发行日期⬇️', v: 'PremiereDate,ProductionYear,SortName:Descending' },  
      { n: '加入日期⬆️', v: 'DateCreated,SortName:Ascending' },  
      { n: '加入日期⬇️', v: 'DateCreated,SortName:Descending' },  
      { n: '名字⬆️', v: 'SortName:Ascending' },  
      { n: '名字⬇️', v: 'SortName:Descending' },  
      { n: '时长⬆️', v: 'Runtime,SortName:Ascending' },  
      { n: '时长⬇️', v: 'Runtime,SortName:Descending' }  
    ];  
  
    const result: any = {  
      class: categories,  
      filters: {}  
    };  
  
    categories.forEach(cat => {  
      result.filters[cat.type_id] = [{ key: 'sort', name: '排序', value: filters }];  
    });  
  
    return result;  
  }  
  
  /**  
   * 内容列表 - 对应 list()  
   */  
  async getCategoryItems(categoryId: string, page: number = 1, sort?: string) {  
    const pageSize = 60;  
    const startIndex = (page - 1) * pageSize;  
      
    // 解析分类ID: {serverId}-{viewIndex}  
    const parts = categoryId.split('-');  
    const viewIndex = parseInt(parts[1]);  
    const views = await this.getViews();  
    const view = views[viewIndex];  
  
    if (!view) {  
      throw new Error('Invalid category ID');  
    }  
  
    // 确定内容类型  
    let type = '';  
    if (view.CollectionType === 'movies') {  
      type = 'Movie';  
    } else if (view.CollectionType === 'tvshows') {  
      type = 'Series';  
    }  
  
    // 解析排序参数  
    const [sortBy, sortOrder] = (sort || 'DateCreated,SortName:Descending').split(':');  
  
    const data = await this.fetch(  
      `/emby/Users/${this.userId}/Items?SortBy=${sortBy}&SortOrder=${sortOrder}&IncludeItemTypes=${type}&Recursive=true&Fields=BasicSyncInfo,PrimaryImageAspectRatio,ProductionYear,CommunityRating&ImageTypeLimit=1&EnableImageTypes=Primary,Backdrop,Thumb&StartIndex=${startIndex}&Limit=${pageSize}&ParentId=${view.Id}`  
    );  
  
    return {  
      list: data.Items.map((item: EmbyItem) => this.formatMovieDetail(item)),  
      page,  
      pagecount: Math.ceil(data.TotalRecordCount / pageSize),  
      total: data.TotalRecordCount,  
      limit: pageSize  
    };  
  }  
  
  /**  
   * 详情 - 对应 detail()  
   */  
  async getItemDetail(itemId: string) {  
    // 解析ID: {serverId}-{embyItemId}  
    const parts = itemId.split('-');  
    const embyItemId = parts[1];  
  
    const item: EmbyItem = await this.fetch(`/emby/Users/${this.userId}/Items/${embyItemId}`);  
  
    let playFrom = this.config.name;  
    let playUrl = `播放$${itemId}`;  
  
    // 如果是剧集,获取所有集数  
    if (item.Type === 'Episode' || item.Type === 'Series') {  
      const seriesId = item.SeriesId || item.Id;  
      const episodesData = await this.fetch(  
        `/emby/Users/${this.userId}/Items?ParentId=${seriesId}&Filters=IsNotFolder&Recursive=true&Limit=2000&Fields=Chapters,ProductionYear,PremiereDate&ExcludeLocationTypes=Virtual&EnableTotalRecordCount=false&CollapseBoxSetItems=false`  
      );  
  
      // 按季分组  
      const seasonMap = new Map<string, string[]>();  
      for (const ep of episodesData.Items) {  
        const seasonName = ep.SeasonName?.replace('未知季', '剧集') || '剧集';  
        if (!seasonMap.has(seasonName)) {  
          seasonMap.set(seasonName, []);  
        }  
        const epName = ep.Name === `第 ${ep.IndexNumber} 集`   
          ? ep.Name   
          : `${ep.IndexNumber}.${ep.Name}`;  
        seasonMap.get(seasonName)!.push(`${epName}$${this.config.id}-${ep.Id}`);  
      }  
  
      const seasons = Array.from(seasonMap.entries());  
      playFrom = seasons.map(([name]) => name).join('$$$');  
      playUrl = seasons.map(([, eps]) => eps.join('#')).join('$$$');  
    }  
  
    return {  
      list: [{  
        vod_id: itemId,  
        vod_name: item.Type === 'Episode' ? item.SeriesName : item.Name,  
        vod_pic: this.getImageUrl(item),  
        vod_year: item.ProductionYear?.toString(),  
        vod_content: item.Overview,  
        vod_director: this.config.name,  
        vod_remarks: item.CommunityRating?.toString() || '',  
        vod_play_from: playFrom,  
        vod_play_url: playUrl  
      }],  
      total: 1,  
      limit: 1  
    };  
  }  
  
  /**  
   * 搜索 - 对应 search()  
   */  
  async search(query: string, quick: boolean = false) {  
    const results: any[] = [];  
  
    // 搜索电影和剧集  
    for (const type of ['Movie', 'Series']) {  
      const data = await this.fetch(  
        `/emby/Users/${this.userId}/Items?IncludePeople=false&IncludeMedia=true&IncludeGenres=false&IncludeStudios=false&IncludeArtists=false&IncludeItemTypes=${type}&Limit=30&Fields=PrimaryImageAspectRatio,BasicSyncInfo,ProductionYear,CommunityRating&Recursive=true&EnableTotalRecordCount=false&ImageTypeLimit=1&searchTerm=${encodeURIComponent(query)}`  
      );  
      results.push(...data.Items.map((item: EmbyItem) => this.formatSearchDetail(item)));  
    }  
  
    return {  
      list: results,  
      total: results.length,  
      limit: results.length  
    };  
  }  
  
  /**  
   * 播放信息 - 对应 play()  
   */  
  async getPlaybackInfo(itemId: string) {  
    // 解析ID  
    const parts = itemId.split('-');  
    const embyItemId = parts[1];  
  
    // DeviceProfile 配置  
    const deviceProfile = {  
      SubtitleProfiles: [  
        { Method: 'Embed', Format: 'ass' },  
        { Format: 'ssa', Method: 'Embed' },  
        { Format: 'subrip', Method: 'Embed' },  
        { Format: 'sub', Method: 'Embed' },  
        { Method: 'Embed', Format: 'pgssub' },  
        { Format: 'subrip', Method: 'External' },  
        { Method: 'External', Format: 'sub' },  
        { Method: 'External', Format: 'ass' },  
        { Format: 'ssa', Method: 'External' },  
        { Method: 'External', Format: 'vtt' }  
      ],  
      MaxStreamingBitrate: 40000000,  
      TranscodingProfiles: [{  
        Container: 'ts',  
        AudioCodec: 'aac,mp3,wav,ac3,eac3,flac,opus',  
        VideoCodec: 'hevc,h264,mpeg4',  
        BreakOnNonKeyFrames: true,  
        Type: 'Video',  
        MaxAudioChannels: '6',  
        Protocol: 'hls',  
        Context: 'Streaming',  
        MinSegments: 2  
      }],  
      DirectPlayProfiles: [{  
        Container: 'mov,mp4,mkv,hls,webm',  
        Type: 'Video',  
        VideoCodec: 'h264,hevc,dvhe,dvh1,h264,hevc,hev1,mpeg4,vp9',  
        AudioCodec: 'aac,mp3,wav,ac3,eac3,flac,truehd,dts,dca,opus,pcm,pcm_s24le'  
      }]  
    };  
  
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
  
    const urls: string[] = [];  
    const subs: Array<{  
      name: string;  
      lang: string;  
      format: string;  
      url: string;  
    }> = [];  
  
    for (const source of data.MediaSources) {  
      urls.push(source.Name);  
      urls.push(this.config.url + (source.DirectStreamUrl || source.Url));  
  
      // 提取字幕  
      for (const stream of source.MediaStreams) {  
        if (stream.Type === 'Subtitle' && stream.DeliveryUrl) {  
          subs.push({  
            name: stream.DisplayTitle || 'Subtitle',  
            lang: stream.Language || 'unknown',  
            format: stream.Codec === 'ass' ? 'text/x-ssa' : 'application/x-subrip',  
            url: this.config.url + stream.DeliveryUrl  
          });  
        }  
      }  
    }  
  
    return {  
      url: urls,  
      subs: subs,  
      header: { 'User-Agent': this.config.userAgent || 'LunaTV/1.0' },  
      parse: 0  
    };  
  }  
  
  /**  
   * 格式化电影详情 - 对应 getMovieDetail()  
   */  
  private formatMovieDetail(item: EmbyItem) {  
    return {  
      vod_id: `${this.config.id}-${item.Id}`,  
      vod_name: item.Type === 'Episode' ? item.SeriesName : item.Name,  
      vod_pic: this.getImageUrl(item),  
      vod_director: this.config.name,  
      vod_remarks: item.CommunityRating?.toString() || '',  
      vod_year: item.ProductionYear?.toString()  
    };  
  }  
  
  /**  
   * 格式化搜索详情 - 对应 getSearchDetail()  
   */  
  private formatSearchDetail(item: EmbyItem) {  
    return {  
      vod_id: `${this.config.id}-${item.Id}`,  
      vod_name: item.Type === 'Episode' ? item.SeriesName : item.Name,  
      vod_pic: this.getImageUrl(item),  
      vod_remarks: `${this.config.name} ${item.CommunityRating?.toString() || ''}`,  
      vod_year: item.ProductionYear?.toString()  
    };  
  }  
  
  /**  
   * 获取图片 URL  
   */  
  private getImageUrl(item: EmbyItem): string | undefined {  
    if (item.ImageTags?.Primary) {  
      return `${this.config.url}/emby/Items/${item.Id}/Images/Primary?maxWidth=400&tag=${item.ImageTags.Primary}&quality=90`;  
    }  
    return undefined;  
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
      throw new Error(`Emby API error: ${response.status} ${response.statusText}`);  
    }  
  
    return response.json();  
  }  
}
    
