/**
 * AL-IMAAMA - Centralized REST API Client & JWT Manager (Stage 3.8)
 *
 * Implements:
 * - Centralized API base URL configuration (/api/v1).
 * - Automatic Authorization header injection (Bearer <access_token>).
 * - Secure localStorage token persistence (access & refresh).
 * - Safe 401 token refresh queue & retry flow.
 * - Standardized error parsing for DRF responses.
 * - Namespaced endpoint clients: auth, users, finances, academics, students, attendance, examinations, settings.
 *
 * Authoritative Specifications:
 * - documentation/phase-1/FRONTEND_API_MAPPING.md
 * - documentation/phase-2/DJANGO_MODEL_SPECIFICATIONS.md
 */

const API_BASE_URL = (typeof window !== 'undefined' && window.__API_BASE_URL__) || '/api/v1';

const TOKEN_KEYS = {
  ACCESS: 'alimaama_access_token',
  REFRESH: 'alimaama_refresh_token',
};

export class ApiError extends Error {
  constructor(message, status = 0, data = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

// Token State & Refresh Lock
let isRefreshing = false;
let refreshSubscribers = [];

function subscribeTokenRefresh(cb) {
  refreshSubscribers.push(cb);
}

function onRefreshed(token) {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
}

export const ApiClient = {
  getAccessToken() {
    return localStorage.getItem(TOKEN_KEYS.ACCESS);
  },

  getRefreshToken() {
    return localStorage.getItem(TOKEN_KEYS.REFRESH);
  },

  setTokens(access, refresh) {
    if (access) localStorage.setItem(TOKEN_KEYS.ACCESS, access);
    if (refresh) localStorage.setItem(TOKEN_KEYS.REFRESH, refresh);
  },

  clearTokens() {
    localStorage.removeItem(TOKEN_KEYS.ACCESS);
    localStorage.removeItem(TOKEN_KEYS.REFRESH);
  },

  hasToken() {
    return !!this.getAccessToken();
  },

  formatError(data, defaultMsg = 'An unexpected error occurred.') {
    if (!data) return defaultMsg;
    if (typeof data === 'string') return data;
    if (data.detail) return data.detail;
    if (data.error) return data.error;
    if (data.message) return data.message;

    // Field validation errors: { field: ["error1", "error2"] }
    const fieldErrors = Object.entries(data)
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
      .join(' | ');

    return fieldErrors || defaultMsg;
  },

  async request(endpoint, options = {}) {
    const url = endpoint.startsWith('http')
      ? endpoint
      : `${API_BASE_URL}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options.headers || {}),
    };

    // Attach Bearer token unless skipAuth is requested
    const accessToken = this.getAccessToken();
    if (accessToken && !options.skipAuth) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    const config = {
      ...options,
      headers,
    };

    if (config.body && typeof config.body === 'object' && !(config.body instanceof FormData)) {
      config.body = JSON.stringify(config.body);
    }

    try {
      const response = await fetch(url, config);

      // Handle 401 Unauthorized -> Attempt token refresh
      if (response.status === 401 && !options._retry && !options.skipAuth && this.getRefreshToken()) {
        if (!isRefreshing) {
          isRefreshing = true;
          try {
            const newAccess = await this.refreshToken();
            isRefreshing = false;
            onRefreshed(newAccess);
          } catch (refreshErr) {
            isRefreshing = false;
            this.clearTokens();
            refreshSubscribers = [];
            if (typeof window !== 'undefined' && window.location) {
              window.location.hash = '#login';
            }
            throw refreshErr;
          }
        }

        // Wait for token refresh to complete
        const retryPromise = new Promise((resolve, reject) => {
          subscribeTokenRefresh((token) => {
            options._retry = true;
            this.request(endpoint, options).then(resolve).catch(reject);
          });
        });

        return retryPromise;
      }

      // 204 No Content
      if (response.status === 204) {
        return null;
      }

      let data;
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        data = await response.json();
      } else {
        data = await response.text();
      }

      if (!response.ok) {
        const errorMsg = this.formatError(data, `Request failed with status ${response.status}`);
        throw new ApiError(errorMsg, response.status, data);
      }

      return data;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw new ApiError(err.message || 'Network connection failed.', 0, null);
    }
  },

  async get(endpoint, params = {}, options = {}) {
    let url = endpoint;
    const query = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') {
        query.append(k, v);
      }
    });
    const qs = query.toString();
    if (qs) {
      url += (url.includes('?') ? '&' : '?') + qs;
    }
    return this.request(url, { ...options, method: 'GET' });
  },

  async post(endpoint, body = {}, options = {}) {
    return this.request(endpoint, { ...options, method: 'POST', body });
  },

  async put(endpoint, body = {}, options = {}) {
    return this.request(endpoint, { ...options, method: 'PUT', body });
  },

  async patch(endpoint, body = {}, options = {}) {
    return this.request(endpoint, { ...options, method: 'PATCH', body });
  },

  async delete(endpoint, options = {}) {
    return this.request(endpoint, { ...options, method: 'DELETE' });
  },

  async refreshToken() {
    const refresh = this.getRefreshToken();
    if (!refresh) throw new ApiError('No refresh token available.', 401);

    const res = await fetch(`${API_BASE_URL}/auth/token/refresh/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ refresh }),
    });

    if (!res.ok) {
      throw new ApiError('Token refresh expired.', res.status);
    }

    const data = await res.json();
    this.setTokens(data.access, data.refresh || refresh);
    return data.access;
  },
};

// =========================================================================
// Namespaced API Domain Services
// =========================================================================

export const API = {
  hasToken() {
    return ApiClient.hasToken();
  },
  // --- AUTH ---
  auth: {
    login(email, password) {
      return ApiClient.post('/auth/token/', { email, password }, { skipAuth: true });
    },
    refreshToken(refresh) {
      return ApiClient.post('/auth/token/refresh/', { refresh }, { skipAuth: true });
    },
    verifyToken(token) {
      return ApiClient.post('/auth/token/verify/', { token }, { skipAuth: true });
    },
    getCurrentUser() {
      return ApiClient.get('/auth/me/');
    },
    logout(refresh) {
      return ApiClient.post('/auth/logout/', { refresh });
    },
    requestPasswordReset(email) {
      return ApiClient.post('/auth/password-reset/', { email }, { skipAuth: true });
    },
    resetPasswordConfirm(token, newPassword) {
      return ApiClient.post('/auth/password-reset/confirm/', { token, newPassword }, { skipAuth: true });
    },
  },

  // --- USERS & RBAC ---
  users: {
    list(params) {
      return ApiClient.get('/users/', params);
    },
    get(id) {
      return ApiClient.get(`/users/${id}/`);
    },
    create(userData) {
      return ApiClient.post('/users/', userData);
    },
    update(id, userData) {
      return ApiClient.patch(`/users/${id}/`, userData);
    },
    delete(id) {
      return ApiClient.delete(`/users/${id}/`);
    },
    resetPassword(id, newPassword) {
      return ApiClient.post(`/users/${id}/reset-password/`, { newPassword });
    },
    savePermissions(id, permissions) {
      return ApiClient.put(`/users/${id}/permissions/`, { permissions });
    },
    applyProfile(id, profile) {
      return ApiClient.post(`/users/${id}/apply-profile/`, { profile });
    },
    me() {
      return ApiClient.get('/users/me/');
    },
  },

  // --- FINANCES & PAYMENTS ---
  finances: {
    // Fee Structures
    feeStructures: {
      list(params) {
        return ApiClient.get('/finances/fee-structures/', params);
      },
      get(id) {
        return ApiClient.get(`/finances/fee-structures/${id}/`);
      },
      create(data) {
        return ApiClient.post('/finances/fee-structures/', data);
      },
      update(id, data) {
        return ApiClient.patch(`/finances/fee-structures/${id}/`, data);
      },
      delete(id) {
        return ApiClient.delete(`/finances/fee-structures/${id}/`);
      },
    },

    // Student Invoices
    invoices: {
      list(params) {
        return ApiClient.get('/finances/invoices/', params);
      },
      get(id) {
        return ApiClient.get(`/finances/invoices/${id}/`);
      },
      create(invoiceData) {
        return ApiClient.post('/finances/invoices/', invoiceData);
      },
      cancel(id, reason = '') {
        return ApiClient.post(`/finances/invoices/${id}/cancel/`, { reason });
      },
    },

    // Payments & Transactions
    payments: {
      list(params) {
        return ApiClient.get('/payments/transactions/', params);
      },
      get(id) {
        return ApiClient.get(`/payments/transactions/${id}/`);
      },
      create(paymentData, idempotencyKey = null) {
        const headers = {};
        if (idempotencyKey) {
          headers['Idempotency-Key'] = idempotencyKey;
        }
        return ApiClient.post('/payments/transactions/', paymentData, { headers });
      },
      reverse(id, reason) {
        return ApiClient.post(`/payments/transactions/${id}/reverse/`, { reason });
      },
      refund(id, amount, reason) {
        return ApiClient.post(`/payments/transactions/${id}/refund/`, { amount, reason });
      },
      receipt(identifier) {
        return ApiClient.get(`/payments/receipt/${identifier}/`);
      },
      ledger(params) {
        return ApiClient.get('/payments/ledger/', params);
      },
    },

    // Incomes
    incomes: {
      list(params) {
        return ApiClient.get('/finances/incomes/', params);
      },
      get(id) {
        return ApiClient.get(`/finances/incomes/${id}/`);
      },
      create(data) {
        return ApiClient.post('/finances/incomes/', data);
      },
      update(id, data) {
        return ApiClient.patch(`/finances/incomes/${id}/`, data);
      },
      delete(id) {
        return ApiClient.delete(`/finances/incomes/${id}/`);
      },
    },

    // Expenses
    expenses: {
      list(params) {
        return ApiClient.get('/finances/expenses/', params);
      },
      get(id) {
        return ApiClient.get(`/finances/expenses/${id}/`);
      },
      create(data) {
        return ApiClient.post('/finances/expenses/', data);
      },
      update(id, data) {
        return ApiClient.patch(`/finances/expenses/${id}/`, data);
      },
      delete(id) {
        return ApiClient.delete(`/finances/expenses/${id}/`);
      },
    },

    // Overview
    overview(params) {
      return ApiClient.get('/finances/overview/', params);
    },
  },

  // --- ACADEMICS ---
  classes: {
    list(params) {
      return ApiClient.get('/classes/', params);
    },
    get(id) {
      return ApiClient.get(`/classes/${id}/`);
    },
    create(data) {
      return ApiClient.post('/classes/', data);
    },
    update(id, data) {
      return ApiClient.patch(`/classes/${id}/`, data);
    },
    delete(id) {
      return ApiClient.delete(`/classes/${id}/`);
    },
  },

  subjects: {
    list(params) {
      return ApiClient.get('/subjects/', params);
    },
    get(id) {
      return ApiClient.get(`/subjects/${id}/`);
    },
    create(data) {
      return ApiClient.post('/subjects/', data);
    },
    update(id, data) {
      return ApiClient.patch(`/subjects/${id}/`, data);
    },
    delete(id) {
      return ApiClient.delete(`/subjects/${id}/`);
    },
  },

  teachers: {
    list(params) {
      return ApiClient.get('/teachers/', params);
    },
    get(id) {
      return ApiClient.get(`/teachers/${id}/`);
    },
    create(data) {
      return ApiClient.post('/teachers/', data);
    },
    update(id, data) {
      return ApiClient.patch(`/teachers/${id}/`, data);
    },
    delete(id) {
      return ApiClient.delete(`/teachers/${id}/`);
    },
  },

  // --- STUDENTS ---
  students: {
    list(params) {
      return ApiClient.get('/students/', params);
    },
    get(id) {
      return ApiClient.get(`/students/${id}/`);
    },
    create(data) {
      return ApiClient.post('/students/', data);
    },
    update(id, data) {
      return ApiClient.patch(`/students/${id}/`, data);
    },
    delete(id) {
      return ApiClient.delete(`/students/${id}/`);
    },
    nextId() {
      return ApiClient.get('/students/next-id/');
    },
  },

  // --- ATTENDANCE ---
  attendance: {
    list(params) {
      return ApiClient.get('/attendance/', params);
    },
    batch(batchData) {
      return ApiClient.post('/attendance/batch/', batchData);
    },
    recordBatch(batchData) {
      return ApiClient.post('/attendance/batch/', batchData);
    },
    sessions(params) {
      return ApiClient.get('/attendance/sessions/', params);
    },
  },

  // --- EXAMINATIONS ---
  examinations: {
    list(params) {
      return ApiClient.get('/examinations/', params);
    },
    saveMarks(marksPayload) {
      return ApiClient.post('/examinations/save-marks/', marksPayload);
    },
    historical(params) {
      return ApiClient.get('/examinations/historical/', params);
    },
  },

  // --- SETTINGS ---
  settings: {
    get() {
      return ApiClient.get('/settings/');
    },
    update(data) {
      return ApiClient.patch('/settings/', data);
    },
    patch(data) {
      return ApiClient.patch('/settings/', data);
    },
  },

  // --- DASHBOARD METRICS (Stage 3.9) ---
  dashboard: {
    metrics() {
      return ApiClient.get('/dashboard/metrics/');
    },
  },
};
