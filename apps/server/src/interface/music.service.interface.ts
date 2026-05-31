// music.service.interface.ts — 分工2 请实现这个接口
//
// 调研结论：
//   推荐 npm 包：jsososo/QQMusicApi（npm: qq-music-api）
//   npm install qq-music-api
//   绿钻 Cookie 获取：y.qq.com 扫码登录 → F12 → 复制 Cookie 整串
//   设置：qqMusic.setCookie('uin=xxx; qm_keyst=xxx; ...')
//
//   核心方法参考：
//   - qqMusic.api('search', { key: keyword, pageNo: 1, pageSize: limit })
//   - qqMusic.api('song/url', { id: songId })
//   - qqMusic.api('lyric', { songmid: songId })

export interface Song {
  id: string;
  title: string;
  artist: string;
  album: string;
  coverUrl: string;
  durationMs: number;
}

export interface SongUrlResult {
  url: string | null;
  br: number; // 码率：128 / 320 / flac
}

export interface LyricResult {
  lrc: string;      // 原始 LRC 歌词
  tlyric?: string;  // 翻译歌词（可能没有）
  yrc?: string;     // 逐字歌词（可能没有）
}

export interface MusicService {
  /** 关键词搜索歌曲，返回歌曲列表 */
  search(keyword: string, limit?: number): Promise<Song[]>;

  /** 根据歌曲 ID 获取可播放的音频 URL */
  getSongUrl(songId: string): Promise<SongUrlResult>;

  /** 获取歌词 */
  getLyric(songId: string): Promise<LyricResult>;
}
