--e7d6fe02bd38920a5e370bd02d97a24aede8740e488cad6e67898b15a99e
Content-Disposition: form-data; name="worker.js"

// worker.js
var RENDER = "https://marco-clean.onrender.com";
var worker_default = {
  async fetch(request) {
    const url = new URL(request.url);
    const target = RENDER + url.pathname + url.search;
    const init = {
      method: request.method,
      headers: request.headers,
      redirect: "manual"
    };
    if (request.method !== "GET" && request.method !== "HEAD") {
      init.body = request.body;
    }
    const response = await fetch(target, init);
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("Location") || "";
      const fixed = location.replace(/^https?:\/\/marco-clean\.onrender\.com/, "https://textmarco.com");
      const newHeaders = new Headers(response.headers);
      if (fixed) newHeaders.set("Location", fixed);
      return new Response(response.body, { status: response.status, headers: newHeaders });
    }
    return response;
  }
};
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map

--e7d6fe02bd38920a5e370bd02d97a24aede8740e488cad6e67898b15a99e--
