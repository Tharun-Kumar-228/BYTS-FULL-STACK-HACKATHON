import axios from "axios";

export const SIM_API = axios.create({
  baseURL: import.meta.env.VITE_SIM_BASE_URL,
  headers: {
    "X-App-Token": "smart-home-client-v1"
  }
});

export const LLM_API = axios.create({
  baseURL: import.meta.env.VITE_LLM_BASE_URL,
  headers: {
    "X-App-Token": "smart-home-client-v1"
  }
});
// Helper to attach token
const attachToken = (config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
};

SIM_API.interceptors.request.use(attachToken);
LLM_API.interceptors.request.use(attachToken);
