const UPSTREAM = {
  churchilllaan: "https://www.hermes.nl/nl/resultaten/halte-informatie?stop=%7B%22stopid%22:%22NL:S:64051510%22,%22town%22:%22Eindhoven%22,%22name%22:%22Churchilllaan%22%7D",
  woensxl: "https://www.hermes.nl/nl/resultaten/halte-informatie?stop=%7B%22stopid%22:%22NL:S:64052010%22,%22town%22:%22Eindhoven%22,%22name%22:%22WoensXL/ZH%20Catharina%22%7D"
};
const CORS = {
  "Access-Control-Allow-Origin": "https://alinageorgia1993-cpu.github.io",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Vary": "Origin"
};
const response = (body, status = 200, type = "text/plain; charset=utf-8") =>
  new Response(body, { status, headers: { ...CORS, "Content-Type": type, "Cache-Control": "no-store" } });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/hermes") {
      if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
      if (request.method !== "GET") return response("Method not allowed", 405);
      const key = url.searchParams.get("stop");
      const stopUrl = UPSTREAM[key];
      if (!stopUrl) return response("Unknown stop", 400);

      // Diagnostic mode: test Hermes directly, without Jina Reader.
      if (url.searchParams.get("direct") === "1") {
        try {
          const upstream = await fetch(stopUrl, {
            headers: {
              "Accept": "text/html,application/xhtml+xml",
              "Accept-Language": "nl-NL,nl;q=0.9,en;q=0.8",
              "User-Agent": "Mozilla/5.0 (compatible; PanelCasa/1.0)"
            },
            cf: { cacheTtl: 0, cacheEverything: false }
          });
          const body = await upstream.text();
          return response("DIRECT_STATUS=" + upstream.status + "\nCONTENT_TYPE=" + (upstream.headers.get("content-type") || "") + "\n\n" + body.slice(0, 12000), upstream.ok ? 200 : 502);
        } catch (error) {
          return response("DIRECT_FETCH_ERROR: " + String(error), 502);
        }
      }

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
        if (!upstream.ok) return response("Hermes reader upstream returned HTTP " + upstream.status + ": " + body.slice(0, 500), 502);
        return response(body);
      } catch (error) {
        return response("Could not retrieve Hermes data: " + String(error), 502);
      }
    }
    return env.ASSETS.fetch(request);
  }
};