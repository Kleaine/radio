// types/qq-music-api.d.ts — qq-music-api 类型声明

declare module "qq-music-api" {
  interface QQMusic {
    setCookie(cookie: string): void;
    api(endpoint: string, params: Record<string, any>): Promise<any>;
  }

  const qqMusic: QQMusic;
  export default qqMusic;
}
