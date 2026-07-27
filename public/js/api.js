const API = {
  token: localStorage.getItem('token'),

  async request(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (this.token) headers['Authorization'] = 'Bearer ' + this.token;

    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(path, opts);
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  },

  get(path) { return this.request('GET', path); },
  post(path, body) { return this.request('POST', path, body); },

  setToken(token) {
    this.token = token;
    localStorage.setItem('token', token);
  },

  clearToken() {
    this.token = null;
    localStorage.removeItem('token');
  },

  isLoggedIn() { return !!this.token; }
};
