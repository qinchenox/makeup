import client from './client.js';

export const documentApi = {
  list: (params) => client.get('/documents', { params }),
  get: (id) => client.get(`/documents/${id}`),
  generate: (data) => client.post('/documents/generate', data),
  delete: (id) => client.delete(`/documents/${id}`),
  downloadUrl: (id) => `/api/documents/${id}/download`,
};
