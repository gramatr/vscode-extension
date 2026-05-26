// gramatr VS Code Extension — Settings Tests
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockGet = vi.fn();

vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: () => ({
      get: mockGet,
    }),
  },
}));

import {
  GRAMATR_SECTION,
  getServerUrl,
  getDashboardUrl,
  getLegacyToken,
  getToken,
  getTimeout,
  isEnabled,
  shouldShowClassification,
} from '../../src/config/settings';

describe('settings', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    mockGet.mockReset();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('exports GRAMATR_SECTION constant', () => {
    expect(GRAMATR_SECTION).toBe('gramatr');
  });

  describe('getServerUrl', () => {
    it('returns setting value when configured', () => {
      mockGet.mockReturnValueOnce('https://custom.server.com');
      expect(getServerUrl()).toBe('https://custom.server.com');
    });

    it('falls back to GMTR_SERVER_URL env var', () => {
      mockGet.mockReturnValueOnce('');
      process.env['GMTR_SERVER_URL'] = 'https://env.server.com';
      expect(getServerUrl()).toBe('https://env.server.com');
    });

    it('falls back to default when no setting and no env var', () => {
      mockGet.mockReturnValueOnce('');
      delete process.env['GMTR_SERVER_URL'];
      expect(getServerUrl()).toBe('https://api.gramatr.com');
    });
  });

  describe('getDashboardUrl', () => {
    it('returns setting value when configured', () => {
      mockGet.mockImplementation((key: string) => {
        if (key === 'dashboardUrl') return '  https://custom-dash.com  ';
        return '';
      });
      expect(getDashboardUrl()).toBe('https://custom-dash.com');
    });

    it('derives dashboard URL from api server URL by replacing api. with app.', () => {
      mockGet.mockImplementation((key: string, defaultValue: unknown) => {
        if (key === 'dashboardUrl') return '';
        if (key === 'serverUrl') return 'https://api.gramatr.com';
        return defaultValue;
      });
      expect(getDashboardUrl()).toBe('https://app.gramatr.com');
    });

    it('derives dashboard URL from non-api hostname', () => {
      mockGet.mockImplementation((key: string, defaultValue: unknown) => {
        if (key === 'dashboardUrl') return '';
        if (key === 'serverUrl') return 'https://gramatr.example.com/some/path?q=1#hash';
        return defaultValue;
      });
      // hostname does not start with 'api.' so it stays as-is, but pathname/search/hash cleared
      const result = getDashboardUrl();
      expect(result).toBe('https://gramatr.example.com');
    });

    it('strips trailing slash from derived URL', () => {
      mockGet.mockImplementation((key: string, defaultValue: unknown) => {
        if (key === 'dashboardUrl') return '';
        if (key === 'serverUrl') return 'https://api.test.com/';
        return defaultValue;
      });
      const result = getDashboardUrl();
      expect(result).not.toMatch(/\/$/);
    });

    it('returns fallback on invalid URL', () => {
      mockGet.mockImplementation((key: string, defaultValue: unknown) => {
        if (key === 'dashboardUrl') return '';
        if (key === 'serverUrl') return 'not-a-valid-url';
        return defaultValue;
      });
      expect(getDashboardUrl()).toBe('https://app.gramatr.com');
    });
  });

  describe('getLegacyToken', () => {
    it('returns setting value when configured', () => {
      mockGet.mockReturnValueOnce('token-from-settings');
      expect(getLegacyToken()).toBe('token-from-settings');
    });

    it('falls back to GRAMATR_TOKEN env var', () => {
      mockGet.mockReturnValueOnce('');
      process.env['GRAMATR_TOKEN'] = 'env-token';
      expect(getLegacyToken()).toBe('env-token');
    });

    it('returns empty string when nothing configured', () => {
      mockGet.mockReturnValueOnce('');
      delete process.env['GRAMATR_TOKEN'];
      expect(getLegacyToken()).toBe('');
    });
  });

  describe('getToken', () => {
    it('is an alias for getLegacyToken', () => {
      mockGet.mockReturnValueOnce('alias-token');
      expect(getToken()).toBe('alias-token');
    });
  });

  describe('getTimeout', () => {
    it('returns configured timeout', () => {
      mockGet.mockReturnValueOnce(30000);
      expect(getTimeout()).toBe(30000);
    });

    it('uses default 15000 when config returns default', () => {
      mockGet.mockReturnValueOnce(15000);
      expect(getTimeout()).toBe(15000);
    });
  });

  describe('isEnabled', () => {
    it('returns true by default', () => {
      mockGet.mockReturnValueOnce(true);
      expect(isEnabled()).toBe(true);
    });

    it('returns false when disabled', () => {
      mockGet.mockReturnValueOnce(false);
      expect(isEnabled()).toBe(false);
    });
  });

  describe('shouldShowClassification', () => {
    it('returns true by default', () => {
      mockGet.mockReturnValueOnce(true);
      expect(shouldShowClassification()).toBe(true);
    });

    it('returns false when disabled', () => {
      mockGet.mockReturnValueOnce(false);
      expect(shouldShowClassification()).toBe(false);
    });
  });
});
