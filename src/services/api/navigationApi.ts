import { apiClient } from './client';
import type { NavigationItem } from '../../types';

const FALLBACK_NAV_ITEMS: NavigationItem[] = [
  {
    id: 'nav-home',
    label_ar: 'الرئيسية',
    label_en: 'Home',
    url: '/',
    testId: 'shell-nav-link-home'
  },
  {
    id: 'nav-offering',
    label_ar: 'تفاصيل الخدمة والمسار',
    label_en: 'Service Offering & Process',
    url: '/offering',
    testId: 'shell-nav-link-offering'
  },
  {
    id: 'nav-pricing',
    label_ar: 'النموذج المالي والتسعير',
    label_en: 'Pricing & Model',
    url: '/pricing',
    testId: 'shell-nav-link-pricing'
  },
  {
    id: 'nav-trust',
    label_ar: 'الثقة والحوكمة',
    label_en: 'Trust & Governance',
    url: '/trust',
    testId: 'shell-nav-link-trust'
  }
];

export const navigationApi = {
  async getNavigation(): Promise<NavigationItem[]> {
    try {
      const response = await apiClient.get<NavigationItem[]>('/api/v1/navigation');
      return response.data || FALLBACK_NAV_ITEMS;
    } catch {
      // Deterministic fallback for standalone/demo mode
      return FALLBACK_NAV_ITEMS;
    }
  }
};

