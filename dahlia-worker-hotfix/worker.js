export default {
  async fetch(request) {
    const url = new URL(request.url);
    const target = 'https://marco-clean.onrender.com/dahlia' + url.pathname + url.search;

    const headers = new Headers(request.headers);
    headers.set('accept-encoding', 'identity');

    const init = {
      method: request.method,
      headers,
      redirect: 'manual',
    };
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      init.body = request.body;
    }

    const response = await fetch(target, init);

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('Location') || '';
      const fixed = location
        .replace(/^https?:\/\/marco-clean\.onrender\.com\/dahlia/, 'https://5142dahlia.textmarco.com')
        .replace(/^https?:\/\/marco-clean\.onrender\.com/, 'https://5142dahlia.textmarco.com');
      const newHeaders = new Headers(response.headers);
      if (fixed) newHeaders.set('Location', fixed);
      return new Response(response.body, { status: response.status, headers: newHeaders });
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      let html = await response.text();
      html = html
        .replaceAll('COMING SOON', '$2,500,000')
        .replaceAll('Coming Soon', '$2,500,000');
      const responseHeaders = new Headers(response.headers);
      responseHeaders.delete('content-length');
      responseHeaders.delete('content-encoding');
      responseHeaders.set('cache-control', 'public, max-age=30');
      responseHeaders.set('content-type', 'text/html; charset=utf-8');
      return new Response(html, { status: response.status, headers: responseHeaders });
    }

    return response;
  }
};
