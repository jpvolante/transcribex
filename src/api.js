// src/api.js
import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env?.VITE_API_URL || "http://localhost:4000/api",
  withCredentials: true, // envia/recebe o cookie HttpOnly
});

// --- Auth ---
export const auth = {
  register: (p) => api.post("/auth/register", p).then(r => r.data),
  login:    (p) => api.post("/auth/login", p).then(r => r.data),
  me:       ()  => api.get("/auth/me").then(r => r.data),
  logout:   ()  => api.post("/auth/logout").then(r => r.data),
};

// --- Files ---
export const files = {
  upload: (file) => {
    const form = new FormData();
    form.append("file", file);
    return api
      .post("/files", form, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      .then((r) => r.data);
  },

  list: () => api.get("/files").then((r) => r.data),

  // URL pública do arquivo (para download/visualização)
  url: (id) => `${api.defaults.baseURL}/files/${id}`,

  remove: (id) => api.delete(`/files/${id}`).then((r) => r.data),
};