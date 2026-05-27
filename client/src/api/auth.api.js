import client from './client.js';

export const authApi = {
  login: (username, password) => client.post('/auth/login', { username, password }),
  register: (data) => client.post('/auth/register', data),
  logout: () => client.post('/auth/logout'),
  me: () => client.get('/auth/me'),
};
