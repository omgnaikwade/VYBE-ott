/**
 * VYBE OTT - Cloudflare Worker TMDB & Proxy Patch
 * Copy/paste this into your Cloudflare Worker script.
 *
 * Make sure to set environment secret:
 * wrangler secret put TMDB_API_KEY
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Range, Content-Type, Authorization, Accept",
          "Access-Control-Max-Age": "86400"
        }
      });
    }

    // 1. Health check
    if (url.pathname === "/api/health") {
      return jsonResponse({ status: "ok", timestamp: Date.now() });
    }

    // 2. Providers list
    if (url.pathname === "/api/providers") {
      return jsonResponse({
        success: true,
        providers: [
          { name: "castletv", enabled: true },
          { name: "netmirror", enabled: true },
          { name: "vidlink", enabled: true },
          { name: "vaplayer", enabled: true },
          { name: "streamflix", enabled: true },
          { name: "onetouchtv", enabled: true },
          { name: "hdghartv", enabled: true },
          { name: "vixsrc", enabled: true },
          { name: "zxcstreams", enabled: true }
        ]
      });
    }

    // 3. TMDB Passthrough with server-side key injection
    if (url.pathname.startsWith("/api/tmdb/")) {
      const tmdbKey = env.TMDB_API_KEY;
      if (!tmdbKey) {
        return jsonResponse({ error: "TMDB_KEY_REQUIRED", message: "TMDB_API_KEY is not set on Worker." }, 503);
      }

      const tmdbSubPath = url.pathname.replace(/^\/api\/tmdb\//, "");
      const tmdbUrl = new URL(`https://api.themoviedb.org/3/${tmdbSubPath}`);

      // Forward query parameters
      for (const [key, value] of url.searchParams.entries()) {
        tmdbUrl.searchParams.set(key, value);
      }
      tmdbUrl.searchParams.set("api_key", tmdbKey);

      try {
        const tmdbRes = await fetch(tmdbUrl.toString(), {
          headers: {
            "Accept": "application/json"
          }
        });

        const data = await tmdbRes.json();
        return jsonResponse(data, tmdbRes.status);
      } catch (err) {
        return jsonResponse({ error: "TMDB_FETCH_FAILED", message: err.message }, 502);
      }
    }

    // 4. Playback Proxy with Header Forwarding & HLS playlist rewriting
    if (url.pathname === "/api/proxy") {
      const targetUrl = url.searchParams.get("url");
      const headersB64 = url.searchParams.get("h");

      if (!targetUrl) {
        return new Response("Missing target url parameter", { status: 400 });
      }

      let customHeaders = {};
      if (headersB64) {
        try {
          const decoded = decodeURIComponent(escape(atob(headersB64)));
          customHeaders = JSON.parse(decoded);
        } catch (e) {
          // Fallback if raw
        }
      }

      const reqHeaders = new Headers();
      // Forward allowed headers
      const allowedHeaders = ["referer", "origin", "user-agent", "accept", "accept-language", "range"];
      for (const [k, v] of Object.entries(customHeaders)) {
        if (allowedHeaders.includes(k.toLowerCase())) {
          reqHeaders.set(k, v);
        }
      }

      // Forward incoming Range for video seeking
      const clientRange = request.headers.get("range");
      if (clientRange) {
        reqHeaders.set("range", clientRange);
      }

      try {
        const streamRes = await fetch(targetUrl, {
          method: "GET",
          headers: reqHeaders
        });

        const contentType = streamRes.headers.get("content-type") || "";
        const isHls = contentType.includes("mpegurl") || targetUrl.includes(".m3u8");

        const resHeaders = new Headers(streamRes.headers);
        resHeaders.set("Access-Control-Allow-Origin", "*");
        resHeaders.set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges");

        // Rewrite HLS manifest links so segments also pass through proxy
        if (isHls) {
          const manifestText = await streamRes.text();
          const baseUrl = new URL(targetUrl);

          const rewritten = manifestText.split("\n").map(line => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith("#")) return line;

            // Absolute or relative URI
            const resolvedUri = new URL(trimmed, baseUrl).toString();
            const proxiedLine = `${url.origin}/api/proxy?url=${encodeURIComponent(resolvedUri)}&h=${encodeURIComponent(headersB64 || "")}`;
            return proxiedLine;
          }).join("\n");

          resHeaders.set("content-type", "application/vnd.apple.mpegurl");
          return new Response(rewritten, {
            status: streamRes.status,
            headers: resHeaders
          });
        }

        // Return streaming response directly (MP4, MKV, Subtitles, Segments)
        return new Response(streamRes.body, {
          status: streamRes.status,
          headers: resHeaders
        });
      } catch (err) {
        return new Response("Proxy error: " + err.message, { status: 502 });
      }
    }

    return new Response("VYBE OTT Backend Worker API", { status: 200 });
  }
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS"
    }
  });
}
