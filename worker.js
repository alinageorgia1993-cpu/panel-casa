const UPSTREAM = {
  churchilllaan: "https://www.hermes.nl/nl/resultaten/halte-informatie?stop=%7B%22stopid%22:%22NL:S:64051510%22,%22town%22:%22Eindhoven%22,%22name%22:%22Churchilllaan%22%7D",
  woensxl: "https://www.hermes.nl/nl/resultaten/halte-informatie?stop=%7B%22stopid%22:%22NL:S:64052010%22,%22town%22:%22Eindhoven%22,%22name%22:%22WoensXL/ZH%20Catharina%22%7D",
  bic: "https://www.hermes.nl/nl/resultaten/halte-informatie?stop=%7B%22stopid%22:%22NL:S:64100160%22,%22town%22:%22Eindhoven%22,%22name%22:%22BIC%22%7D"
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

      // Fetch the official Hermes departures JSON directly.
      try {
        const stopData = key === "churchilllaan"
          ? { stopid: "NL:S:64051510", town: "Eindhoven", name: "Churchilllaan" }
          : key === "woensxl"
            ? { stopid: "NL:S:64052010", town: "Eindhoven", name: "WoensXL/ZH Catharina" }
            : { stopid: "NL:S:64100160", town: "Eindhoven", name: "BIC" };
        const apiUrl = new URL("https://www.hermes.nl/api/travelplanner/stops/departures");
        apiUrl.searchParams.set("stop", JSON.stringify(stopData));
        const upstream = await fetch(apiUrl.toString(), {
          headers: {
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "nl-NL,nl;q=0.9,en;q=0.8",
            "Referer": stopUrl,
            "User-Agent": "Mozilla/5.0 (compatible; PanelCasa/1.0)"
          },
          cf: { cacheTtl: 0, cacheEverything: false }
        });
        const body = await upstream.text();
        return response(body, upstream.ok ? 200 : 502, upstream.headers.get("content-type") || "application/json; charset=utf-8");
      } catch (error) {
        return response("HERMES_API_ERROR: " + String(error), 502);
      }

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
          return response("DIRECT_STATUS=" + upstream.status + "\nCONTENT_TYPE=" + (upstream.headers.get("content-type") || "") + "\n\n" + (() => { const marker = body.toLowerCase().indexOf("actuele vertrektijden"); return marker >= 0 ? body.slice(Math.max(0, marker - 2500), marker + 18000) : "MARKER_NOT_FOUND\\nHTML_LENGTH=" + body.length + "\\n" + body.slice(-12000); })(), upstream.ok ? 200 : 502);
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

    if (url.pathname === "/api/tasks" || url.pathname.startsWith("/api/tasks/")) {
      if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
      if (!env.DB) return response(JSON.stringify({ error: "TASKS_DATABASE_NOT_CONFIGURED" }), 503, "application/json; charset=utf-8");
      const id = url.pathname.split("/")[3];
      try {
        if (request.method === "GET" && !id) {
          const result = await env.DB.prepare("SELECT id,title,category,due_date,due_time,priority,recurrence,reminder_at,status,created_at,completed_at FROM tasks ORDER BY CASE WHEN status='open' THEN 0 ELSE 1 END, COALESCE(due_date,'9999-12-31'), created_at DESC").all();
          return response(JSON.stringify({ tasks: result.results || [] }), 200, "application/json; charset=utf-8");
        }
        if (request.method === "POST" && !id) {
          const body = await request.json();
          const title = String(body.title || "").trim().slice(0,160);
          const categories = ["PLANTS","HOUSE","ERRANDS","ADMIN","ARCHIBALD","PERSONAL"];
          const priorities = ["low","normal","high"];
          if (!title) return response(JSON.stringify({ error: "TITLE_REQUIRED" }), 400, "application/json; charset=utf-8");
          const taskId = crypto.randomUUID();
          const now = new Date().toISOString();
          await env.DB.prepare("INSERT INTO tasks (id,title,category,due_date,priority,status,created_at,updated_at) VALUES (?,?,?,?,?,'open',?,?)")
            .bind(taskId,title,categories.includes(body.category)?body.category:"HOUSE",body.due_date || null,priorities.includes(body.priority)?body.priority:"normal",now,now).run();
          return response(JSON.stringify({ ok: true, id: taskId }), 201, "application/json; charset=utf-8");
        }
        if (id && request.method === "PATCH") {
          const body = await request.json();
          const allowed = ["open","done"];
          if (!allowed.includes(body.status)) return response(JSON.stringify({ error: "INVALID_STATUS" }), 400, "application/json; charset=utf-8");
          const now = new Date().toISOString();
          const result = await env.DB.prepare("UPDATE tasks SET status=?, completed_at=?, updated_at=? WHERE id=?")
            .bind(body.status,body.status==="done"?now:null,now,id).run();
          return response(JSON.stringify({ ok: true, changes: result.meta && result.meta.changes || 0 }), 200, "application/json; charset=utf-8");
        }
        if (id && request.method === "DELETE") {
          const result = await env.DB.prepare("DELETE FROM tasks WHERE id=?").bind(id).run();
          return response(JSON.stringify({ ok: true, changes: result.meta && result.meta.changes || 0 }), 200, "application/json; charset=utf-8");
        }
        return response(JSON.stringify({ error: "METHOD_NOT_ALLOWED" }), 405, "application/json; charset=utf-8");
      } catch (error) {
        return response(JSON.stringify({ error: "TASKS_API_ERROR", detail: String(error) }), 500, "application/json; charset=utf-8");
      }
    }

    return env.ASSETS.fetch(request);
  }
};