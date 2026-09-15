import axios from 'axios';

const configuredLocalUrl = import.meta.env.VITE_LOCAL_APP_URL || '/api/v1';
const localAppUrl = import.meta.env.DEV && /localhost|127\.0\.0\.1/.test(configuredLocalUrl) ? '/api/v1' : configuredLocalUrl;
const serverAppUrl = import.meta.env.VITE_SERVER_APP_URL || '';
const isDevelopment = import.meta.env.MODE === 'development';
export const appUrl = isDevelopment ? localAppUrl : serverAppUrl;
export const urls = {
  localAppUrl,
  serverAppUrl,
  localAdminUrl: import.meta.env.VITE_LOCAL_ADMIN_URL || 'http://localhost:5173',
  serverAdminUrl: import.meta.env.VITE_SERVER_ADMIN_URL || ''
};
export const api = axios.create({ baseURL: appUrl, withCredentials: true });
let accessToken = localStorage.getItem('indonor_access_token');
export const getAccessToken = () => accessToken;
export const setAccessToken = (token) => { accessToken = token; if (token) localStorage.setItem('indonor_access_token', token); else localStorage.removeItem('indonor_access_token'); };
const isAuthHandshake = (url = '') => /\/auth\/(login|refresh|logout|forgot-password|reset-password)/.test(url);
api.interceptors.request.use((config) => {
  if (accessToken && !isAuthHandshake(config.url)) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});
api.interceptors.response.use((response) => response, async (error) => {
  const original = error.config;
  if (error.response?.status === 401 && original && !original._retry && !isAuthHandshake(original.url)) {
    original._retry = true;
    try {
      const { data } = await api.post('/auth/refresh');
      setAccessToken(data.data.accessToken);
      original.headers = original.headers || {};
      original.headers.Authorization = `Bearer ${data.data.accessToken}`;
      return api(original);
    } catch {
      setAccessToken(null);
    }
  }
  return Promise.reject(error);
});
export const unwrap = (request) => request.then(({ data }) => data);

export function apiErrorMessage(error, fallback = 'Request failed') {
  const details = (error.response?.data?.errors || []).map((item) => item.message || item).filter(Boolean).join('; ');
  if (error.response?.data?.message) return details ? `${error.response.data.message}. ${details}` : error.response.data.message;
  if (error.code === 'ERR_NETWORK' || /ECONNRESET|Network Error/i.test(error.message || '')) {
    return import.meta.env.DEV
      ? 'Could not reach the API. Confirm the backend is running on port 5000, then try again.'
      : 'Could not reach the API. Refresh and try again. If this continues, the server may still be starting.';
  }
  return error.message || fallback;
}
