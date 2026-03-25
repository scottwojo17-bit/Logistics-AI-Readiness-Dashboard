import React, { useState, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import Markdown from 'react-markdown';
import { Loader2, Map as MapIcon, TrendingUp } from 'lucide-react';
import { dashboardData } from '../data';
import { aggregateKPIs, groupByRegion } from '../utils';

export function ForecastSection({ shipments }: { shipments: any[] }) {
  const [forecast, setForecast] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [mapLinks, setMapLinks] = useState<{uri: string, title: string}[]>([]);

  useEffect(() => {
    async function fetchForecast() {
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        
        // Calculate historical baseline context
        const regionAgg = groupByRegion(shipments);
        const baselineContext = dashboardData.metadata.regions.map(r => {
          const k = regionAgg[r] || aggregateKPIs([]);
          return `${r}: Avg Delivery ${k.avgDeliveryDays?.toFixed(1) || 0} days, Delay Rate ${((k.delayRate || 0) * 100).toFixed(1)}%`;
        }).join('; ');

        const prompt = `You are a logistics AI. Based on current Google Maps data for major freight hubs (Los Angeles, Dallas, Chicago, Atlanta, New York) AND the following historical baseline: [${baselineContext}], provide a 7-day freight forecast. For each region (West, Southwest, Midwest, Southeast, Northeast), provide: 1. Expected Volume Trend 2. Delay Risk (Low, Medium, High) 3. Key routing disruptions or traffic conditions. Format as a concise Markdown list.`;

        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: prompt,
          config: {
            tools: [{ googleMaps: {} }]
          }
        });
        
        setForecast(response.text || 'No forecast available.');
        
        const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
        if (chunks) {
            const links: {uri: string, title: string}[] = [];
            chunks.forEach((chunk: any) => {
                if (chunk.web?.uri) {
                    links.push({ uri: chunk.web.uri, title: chunk.web.title || 'Source Link' });
                } else if (chunk.maps?.uri) {
                    links.push({ uri: chunk.maps.uri, title: chunk.maps.title || 'Google Maps Link' });
                }
            });
            // Deduplicate links
            const uniqueLinks = Array.from(new Map(links.map(item => [item.uri, item])).values());
            setMapLinks(uniqueLinks);
        }
      } catch (e) {
        console.error(e);
        setForecast("Failed to load forecast data from Google Maps. Please ensure your API key is valid and has access to Gemini 2.5 Flash.");
      } finally {
        setLoading(false);
      }
    }
    fetchForecast();
  }, [shipments]);

  return (
    <div className="bg-[#0e1424] rounded-2xl border border-slate-800 p-4 shadow-[0_18px_40px_rgba(0,0,0,0.6)] flex flex-col gap-3">
      <div className="flex justify-between items-baseline">
        <div>
          <div className="text-xs uppercase tracking-widest text-slate-400 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-teal-400" />
            7-Day AI Forecast & Live Routing
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Powered by Google Maps real-time data & historical baselines</div>
        </div>
      </div>
      
      {loading ? (
        <div className="flex items-center justify-center py-12 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin mr-2 text-teal-400" />
          <span className="text-sm">Analyzing live map data and historical trends...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-6 mt-2">
          <div className="markdown-body text-[13px] text-slate-300">
            <Markdown>{forecast}</Markdown>
          </div>
          
          {mapLinks.length > 0 && (
            <div className="bg-[#10182b] rounded-xl border border-slate-800 p-3 h-fit">
              <div className="text-[11px] uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-1.5">
                <MapIcon className="w-3.5 h-3.5" />
                Grounding Sources
              </div>
              <ul className="flex flex-col gap-2.5">
                {mapLinks.map((link, i) => (
                  <li key={i}>
                    <a href={link.uri} target="_blank" rel="noreferrer" className="text-[11px] text-blue-400 hover:text-blue-300 hover:underline flex items-start gap-1.5 leading-tight">
                      <span className="shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full bg-blue-400/50"></span>
                      <span className="line-clamp-2">{link.title}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
