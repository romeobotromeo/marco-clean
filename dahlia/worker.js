export default {
  async fetch(request) {
    const url = new URL(request.url);
    const target = 'https://marco-clean.onrender.com/dahlia' + url.pathname + url.search;

    const init = {
      method: request.method,
      headers: request.headers,
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

    return response;
  }
};
