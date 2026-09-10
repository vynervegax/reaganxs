// apps/web/src/lib/api.ts

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(
  /\/$/,
  ''
);

export interface ProcessResult {
  success: boolean;
  url?: string;
  savingsPercent?: number;
  vmafScore?: number | null;
  modelUsed?: string;
  expiryHours?: number;
  isDemo?: boolean;
  tier?: string;
  message?: string;
}

export interface DeviceProfile {
  vram: number;
  batteryLevel: number;
  isLowPower: boolean;
  platform: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  tier: 'demo' | 'free' | 'premium' | 'desktop';
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
  message?: string;
}

export const api = {
  // ---------- Auth ----------
  async login(email: string, password: string): Promise<AuthResponse> {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || data.message || 'Login failed');
    }
    return data;
  },

  async register(
    name: string,
    email: string,
    password: string
  ): Promise<AuthResponse> {
    const res = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || data.message || 'Registration failed');
    }
    return data;
  },

  async forgotPassword(email: string): Promise<{ message: string }> {
    const res = await fetch(`${API_BASE}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || data.message || 'Request failed');
    }
    return data;
  },

  async resetPassword(
    token: string,
    password: string
  ): Promise<{ message: string }> {
    const res = await fetch(`${API_BASE}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || data.message || 'Reset failed');
    }
    return data;
  },

  async getProfile(token: string) {
    const res = await fetch(`${API_BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Failed to fetch profile');
    }
    return data;
  },

async getHistory(token: string) {
  const res = await fetch(`${API_BASE}/api/history`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || 'Failed to load history');
  }
  return data;
},

async getDemoHistory() {
  const res = await fetch(`${API_BASE}/api/history/demo`);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || 'Failed to load demo history');
  }
  return data;
},

  // ---------- Process ----------
  async processVideo(
    file: File,
    options: {
      model?: string;
      deviceProfile?: DeviceProfile;
      token?: string | null;
    } = {}
  ): Promise<ProcessResult> {
    const formData = new FormData();
    formData.append('video', file);

    if (options.model) {
      formData.append('model', options.model);
    }

    if (options.deviceProfile) {
      formData.append('deviceProfile', JSON.stringify(options.deviceProfile));
    }

    const headers: HeadersInit = {};
    if (options.token) {
      headers['Authorization'] = `Bearer ${options.token}`;
    }

    const res = await fetch(`${API_BASE}/api/process`, {
      method: 'POST',
      headers,
      body: formData,
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Processing failed');
    }
    return data;
  },
};