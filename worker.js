const UPSTREAM = {
  churchilllaan: "https://www.hermes.nl/nl/resultaten/halte-informatie?stop=%7B%22stopid%22%3A%22NL:S:64051510%22,%22town%22:%22Eindhoven%22,%22name%22:%22Churchilllaan%22%7D",
  woensxl: "https://www.hermes.nl/nl/resultaten/halte-informatie?stop=%7B%22stopid%22%3A%22NL:S:64052010%22,%22town%22:%22Eindhoven%22,%22name%22:%22WoensXL/ZH Catharina%22%7D"
};
const CORS = {
  "Access-Control-Allow-Origin": "https://alinageorgia1993-cpu.github.io",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Vary": "Origin"
};
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/hermes") {
      if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
      if (request.method !== "GET") return new Response("Method not allowed", { status: 405, headers: CORS });
      const key = url.searchParams.get("stop");
      const stopUrl = UPSTREAM[key];
      if (!stopUrl) return new Response("Unknown stop", { status: 400, headers: CORS });
      try {
        const target = "https://r.jina.ai/http://" + stopUrl.replace(/^https?:\/\//, "");
        const upstream = await fetch(target, {
          headers: {
            "Accept": "text/plain",
            "X-Return-Format": "text",
            "User-Agent": "PanelCasa/1.0"
          },
          cf: { cacheTtl: 0, cacheEverything: false }
        });
        const body = await upstream.text();
        if (!upstream.ok) {
          return new Response("Hermes reader upstream returned HTTP " + upstream.status + ": " + body.slice(0, 500), {
            status: 502, headers: { ...CORS, "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }
          });
        }
        return new Response(body, {
          headers: { ...CORS, "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }
        });
      } catch (error) {
        return new Response("Could not retrieve Hermes data: " + String(error), {
          status: 502, headers: { ...CORS, "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }
        });
      }
    }
    return env.ASSETS.fetch(request);
  }
};
