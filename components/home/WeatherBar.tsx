'use client';

import { useState, useEffect } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import { ACTIVE_CITY } from '@/lib/city-config';

interface WeatherData {
  temp: number;
  condition: string;
}

const FALLBACK_WEATHER: WeatherData = { temp: 24, condition: 'clouds' };

const WEATHER_MESSAGES: Record<string, { en: string; es: string }> = {
  clear: {
    en: 'Perfect day for outdoor training',
    es: 'Día perfecto para entrenar al aire libre',
  },
  clouds: {
    en: 'Great weather for a session outside',
    es: 'Buen clima para una sesión al aire libre',
  },
  rain: {
    en: 'Rainy — perfect for indoor sessions',
    es: 'Lluvia — perfecto para sesiones en interior',
  },
  drizzle: {
    en: 'Light rain — train through it or go indoors',
    es: 'Lluvia ligera — entrena igual o ve adentro',
  },
  thunderstorm: {
    en: 'Storm alert — indoor sessions recommended',
    es: 'Alerta de tormenta — sesiones en interior recomendadas',
  },
};

const WEATHER_ICONS: Record<string, string> = {
  clear: '☀️',
  clouds: '⛅',
  rain: '🌧️',
  drizzle: '🌦️',
  thunderstorm: '⛈️',
};

export default function WeatherBar() {
  const { language } = useLanguage();
  const [weather, setWeather] = useState<WeatherData>(FALLBACK_WEATHER);

  useEffect(() => {
    const { lat, lng } = ACTIVE_CITY.weatherLocation;
    fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code&timezone=${encodeURIComponent(ACTIVE_CITY.timezone)}`
    )
      .then((res) => res.json())
      .then((data) => {
        if (data?.current) {
          const temp = Math.round(data.current.temperature_2m);
          const code = data.current.weather_code;
          let condition = 'clouds';
          if (code <= 1) condition = 'clear';
          else if (code <= 3) condition = 'clouds';
          else if (code >= 51 && code <= 55) condition = 'drizzle';
          else if (code >= 61 && code <= 65) condition = 'rain';
          else if (code >= 95) condition = 'thunderstorm';
          setWeather({ temp, condition });
        }
      })
      .catch(() => {
        // Silently fall back — weather is nice-to-have
      });
  }, []);

  const message = WEATHER_MESSAGES[weather.condition] || WEATHER_MESSAGES.clouds;

  return (
    <div className="flex items-center gap-2 mx-4 mt-1.5 mb-1 px-3 py-2 bg-blue-500/[0.08] border border-blue-500/[0.15] rounded-xl">
      <span className="text-lg">{WEATHER_ICONS[weather.condition] || '⛅'}</span>
      <p className="flex-1 text-xs text-stone-500 dark:text-gray-400">
        <span className="font-bold text-stone-900 dark:text-white">{weather.temp}°C</span>
        {' · '}
        {language === 'es' ? message.es : message.en}
      </p>
    </div>
  );
}
