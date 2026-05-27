import client from './client.js';

export const datasourceApi = {
  list: (params) => client.get('/datasources', { params }),
  get: (id) => client.get(`/datasources/${id}`),
  upload: (formData) => client.post('/datasources/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  update: (id, data) => client.put(`/datasources/${id}`, data),
  delete: (id) => client.delete(`/datasources/${id}`),
  updatePoint: (id, data) => client.put(`/datasources/points/${id}`, data),
  deletePoint: (id) => client.delete(`/datasources/points/${id}`),
  fromUrl: (data) => client.post('/datasources/from-url', data),
};
