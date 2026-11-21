import type { ApiResponse } from '../../types';

const API_BASE_URL = import.meta.env?.VITE_API_URL || "";

export interface RequestOptions extends RequestInit {
  params?: Record<string, string | number | boolean>;
}

export class ApiClient {
  private static instance: ApiClient;
  // Security standard FE-S01: Keep bearer tokens strictly in-memory (never in localStorage/sessionStorage)
  private inMemoryToken: string | null = null;

  private constructor() {
    this.inMemoryToken = null;
  }

  public static getInstance(): ApiClient {
    if (!ApiClient.instance) {
      ApiClient.instance = new ApiClient();
    }
    return ApiClient.instance;
  }

  public setToken(token: string | null): void {
    this.inMemoryToken = token;
  }

  public getToken(): string | null {
    return this.inMemoryToken;
  }

  public async request<T>(endpoint: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
    const { params, headers = {}, ...rest } = options;
    const url = new URL(endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`);

    if (params) {
      Object.entries(params).forEach(([key, val]) => {
        if (val !== undefined && val !== null) {
          url.searchParams.append(key, String(val));
        }
      });
    }

    const defaultHeaders: Record<string, string> = {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    };

    if (this.inMemoryToken) {
      defaultHeaders['Authorization'] = `Bearer ${this.inMemoryToken}`;
    }

    try {
      const response = await fetch(url.toString(), {
        headers: {
          ...defaultHeaders,
          ...(headers as Record<string, string>)
        },
        ...rest
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      throw error;
    }
  }

  public async get<T>(endpoint: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...options, method: 'GET' });
  }

  public async post<T>(endpoint: string, body?: any, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined
    });
  }
}

export const apiClient = ApiClient.getInstance();
