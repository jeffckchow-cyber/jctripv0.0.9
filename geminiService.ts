
import { GoogleGenAI, Type } from "@google/genai";

const WEATHER_CACHE_PREFIX = "ws_weather_";
const COOLDOWN_KEY = "ws_weather_cooldown";
const CACHE_DURATION = 4 * 60 * 60 * 1000; // Increase to 4 hours to save quota
const COOLDOWN_DURATION = 15 * 60 * 1000; // 15 minute circuit breaker on 429

async function retryWithBackoff<T>(fn: () => Promise<T>, maxRetries = 1, initialDelay = 3000): Promise<T> {
  let delay = initialDelay;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      const isRateLimit = error?.message?.includes("429") || error?.status === 429 || error?.message?.includes("RESOURCE_EXHAUSTED");
      
      if (isRateLimit) {
        // Set a global cooldown to stop all weather calls for a while
        localStorage.setItem(COOLDOWN_KEY, (Date.now() + COOLDOWN_DURATION).toString());
        console.warn(`Weather API rate limited (429). Setting cooldown for ${COOLDOWN_DURATION / 60000} mins.`);
      }

      if (i < maxRetries && isRateLimit) {
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2;
        continue;
      }
      throw error;
    }
  }
  throw new Error("Max retries exceeded");
}

export const getCityWeather = async (city: string) => {
  if (!city) return null;
  
  const cacheKey = `${WEATHER_CACHE_PREFIX}${city.toLowerCase().replace(/\s+/g, '_')}`;
  
  // 1. Check Cooldown (Circuit Breaker)
  const cooldownUntil = localStorage.getItem(COOLDOWN_KEY);
  if (cooldownUntil && Date.now() < parseInt(cooldownUntil)) {
    console.log("Weather fetch skipped: Circuit breaker active due to previous 429.");
    // Fallback to cache even if expired if we are in cooldown
    const cached = localStorage.getItem(cacheKey);
    if (cached) return JSON.parse(cached).data;
    return null;
  }

  // 2. Check Cache
  const cached = localStorage.getItem(cacheKey);
  if (cached) {
    const { data, timestamp } = JSON.parse(cached);
    if (Date.now() - timestamp < CACHE_DURATION) {
      return data;
    }
  }

  // 3. API Call
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const prompt = `What is the current temperature in ${city}? Return only a JSON object with 'temp' (number in Celsius) and 'condition' (short string like "Sunny", "Rainy").`;
  
  try {
    const response = await retryWithBackoff(async () => {
      return await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              temp: { type: Type.NUMBER },
              condition: { type: Type.STRING }
            },
            required: ["temp", "condition"]
          }
        }
      });
    });

    const weatherData = JSON.parse(response.text || '{}');
    if (weatherData.temp !== undefined) {
      localStorage.setItem(cacheKey, JSON.stringify({
        data: weatherData,
        timestamp: Date.now()
      }));
      return weatherData;
    }
    return null;
  } catch (e) {
    console.error("Weather Fetch Final Error:", e);
    // On failure, if we have any cached data at all, return it as a stale fallback
    if (cached) return JSON.parse(cached).data;
    return null;
  }
};
