// weather.service.ts — 天气服务
// 三层回退：OpenWeather → Wttr.in → Mock

export interface WeatherData {
  temp: number;       // 摄氏度
  description: string; // 中文天气描述
  city: string;
}

export interface WeatherService {
  getCurrent(): Promise<WeatherData>;
}

// ── 第 0 层：Mock ──

const mockWeather: WeatherData = {
  temp: 22,
  description: "晴",
  city: "本地",
};

// ── 第 1 层：OpenWeatherMap ──

async function fetchOpenWeather(apiKey: string, city: string): Promise<WeatherData | null> {
  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${apiKey}&units=metric&lang=zh_cn`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) return null;
    const data = await res.json() as any;
    return {
      temp: Math.round(data.main?.temp ?? 0),
      description: data.weather?.[0]?.description ?? "未知",
      city: data.name ?? city,
    };
  } catch {
    return null;
  }
}

// ── 第 2 层：Wttr.in（免费，无需 API Key）──

async function fetchWttrIn(city: string): Promise<WeatherData | null> {
  try {
    const url = `https://wttr.in/${encodeURIComponent(city)}?format=j1`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) return null;
    const data = await res.json() as any;
    const current = data?.current_condition?.[0];
    return {
      temp: current?.temp_C ? Math.round(Number(current.temp_C)) : 0,
      description: current?.lang_zh?.[0]?.value ?? current?.weatherDesc?.[0]?.value ?? "未知",
      city,
    };
  } catch {
    return null;
  }
}

// ── 对外接口 ──

export function createWeatherService(config?: { openWeatherApiKey?: string; city?: string }): WeatherService {
  const apiKey = config?.openWeatherApiKey ?? "";
  const city = config?.city ?? "Beijing";
  let cachedWeather: WeatherData | null = null;

  return {
    async getCurrent(): Promise<WeatherData> {
      // 第 1 层：OpenWeatherMap（需 API Key）
      if (apiKey) {
        const result = await fetchOpenWeather(apiKey, city);
        if (result) {
          cachedWeather = result;
          return result;
        }
      }

      // 第 2 层：Wttr.in（免费）
      const wttrResult = await fetchWttrIn(city);
      if (wttrResult) {
        cachedWeather = wttrResult;
        return wttrResult;
      }

      // 第 3 层：Mock（兜底，或用上次缓存）
      return cachedWeather ?? mockWeather;
    },
  };
}
