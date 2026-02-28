'use client'

import './globals.css'
import { Source_Sans_3 } from 'next/font/google'
import Sidebar from '@/components/Sidebar'
import { SidebarProvider } from '@/components/Sidebar/SidebarProvider'
import MainContent from '@/components/MainContent'
import { Toaster } from 'sonner'
import "sonner/dist/styles.css"
import { useEffect } from 'react'
import { listen } from '@tauri-apps/api/event'
import { TooltipProvider } from '@/components/ui/tooltip'
import { RecordingStateProvider } from '@/contexts/RecordingStateContext'
import { OllamaDownloadProvider } from '@/contexts/OllamaDownloadContext'
import { TranscriptProvider } from '@/contexts/TranscriptContext'
import { ConfigProvider } from '@/contexts/ConfigContext'
import { DownloadProgressToastProvider } from '@/components/shared/DownloadProgressToast'
import { UpdateCheckProvider } from '@/components/UpdateCheckProvider'
import { RecordingPostProcessingProvider } from '@/contexts/RecordingPostProcessingProvider'

const sourceSans3 = Source_Sans_3({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-source-sans-3',
})

// export { metadata } from './metadata'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Disable context menu in production
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') {
      const handleContextMenu = (e: MouseEvent) => e.preventDefault();
      document.addEventListener('contextmenu', handleContextMenu);
      return () => document.removeEventListener('contextmenu', handleContextMenu);
    }
  }, []);
  useEffect(() => {
    // Listen for tray recording toggle request
    const unlisten = listen('request-recording-toggle', () => {
      console.log('[Layout] Received request-recording-toggle from tray');
      // Always forward to main app flow (onboarding screens disabled)
      console.log('[Layout] Forwarding to start-recording-from-sidebar');
      window.dispatchEvent(new CustomEvent('start-recording-from-sidebar'));
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, []);

  return (
    <html lang="en">
      <body className={`${sourceSans3.variable} font-sans antialiased`}>
        <RecordingStateProvider>
          <TranscriptProvider>
            <ConfigProvider>
              <OllamaDownloadProvider>
                <UpdateCheckProvider>
                  <SidebarProvider>
                    <TooltipProvider>
                      <RecordingPostProcessingProvider>
                        {/* Download progress toast provider - listens for background downloads */}
                        <DownloadProgressToastProvider />
                        <div className="flex">
                          <Sidebar />
                          <MainContent>{children}</MainContent>
                        </div>
                      </RecordingPostProcessingProvider>
                    </TooltipProvider>
                  </SidebarProvider>
                </UpdateCheckProvider>

              </OllamaDownloadProvider>
            </ConfigProvider>
          </TranscriptProvider>
        </RecordingStateProvider>
        <Toaster position="bottom-center" richColors closeButton />
      </body>
    </html>
  )
}
