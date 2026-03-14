import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { AppShell } from '@/components/app-shell';
import { TabsProvider } from '@/hooks/use-tabs';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/hooks/use-main-ready', () => ({
  useMainReady: () => false,
}));

vi.mock('@/hooks/use-analysis', () => ({
  useAnalysis: () => ({
    jobs: [],
  }),
}));

describe('AppShell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders tabs in a horizontally scrollable strip and keeps the active tab visible', async () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      writable: true,
      value: scrollIntoView,
    });

    const router = createMemoryRouter(
      [
        {
          path: '/',
          element: (
            <TabsProvider>
              <AppShell>
                <div>content</div>
              </AppShell>
            </TabsProvider>
          ),
          children: [
            {
              path: 'papers/:id/reader',
              element: <div>reader</div>,
            },
          ],
        },
      ],
      {
        initialEntries: ['/papers/paper-1/reader'],
      },
    );

    render(<RouterProvider router={router} />);

    await screen.findByText('paper-1');

    const tabStrip = screen.getByTestId('top-tab-strip');
    expect(tabStrip.className).toContain('overflow-x-auto');

    await waitFor(() => {
      expect(scrollIntoView).toHaveBeenCalledWith({
        block: 'nearest',
        inline: 'nearest',
      });
    });
  });
});
