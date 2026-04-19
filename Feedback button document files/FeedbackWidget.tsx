// components/FeedbackWidget.tsx
// ============================================================
// Floating action button + bottom sheet feedback form.
// Drop this component into your root layout or main page.
//
// Usage:
//   import { FeedbackWidget } from '@/components/FeedbackWidget';
//   <FeedbackWidget appVersion="2.5.0" />
// ============================================================

'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import type { FeedbackCategory, DeviceInfo } from '@/types/feedback';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface FeedbackWidgetProps {
  /** Current app version string, e.g. "2.5.0" */
  appVersion?: string;
  /** Bottom offset in px to clear the tab bar. Default: 72 */
  bottomOffset?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORIES: { value: FeedbackCategory; label: string }[] = [
  { value: 'bug', label: 'Bug report' },
  { value: 'feature_request', label: 'Feature idea' },
  { value: 'general', label: 'General' },
];

const MIN_MESSAGE_LENGTH = 10;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_SCREENSHOT_SIZE_MB = 5;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FeedbackWidget({
  appVersion,
  bottomOffset = 72,
}: FeedbackWidgetProps) {
  const supabase = createClientComponentClient();

  // State
  const [isOpen, setIsOpen] = useState(false);
  const [category, setCategory] = useState<FeedbackCategory>('bug');
  const [message, setMessage] = useState('');
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitState, setSubmitState] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset form when closing
  const resetForm = useCallback(() => {
    setCategory('bug');
    setMessage('');
    setScreenshot(null);
    setScreenshotPreview(null);
    setSubmitState('idle');
    setErrorMessage('');
  }, []);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    // Delay reset so the closing animation plays with content visible
    setTimeout(resetForm, 300);
  }, [resetForm]);

  // Auto-close after success
  useEffect(() => {
    if (submitState === 'success') {
      const timer = setTimeout(handleClose, 2000);
      return () => clearTimeout(timer);
    }
  }, [submitState, handleClose]);

  // Screenshot handling
  const handleScreenshotSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size
    if (file.size > MAX_SCREENSHOT_SIZE_MB * 1024 * 1024) {
      setErrorMessage(`Screenshot must be under ${MAX_SCREENSHOT_SIZE_MB}MB.`);
      return;
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setErrorMessage('Please select an image file.');
      return;
    }

    setScreenshot(file);
    setErrorMessage('');

    // Generate preview
    const reader = new FileReader();
    reader.onload = () => setScreenshotPreview(reader.result as string);
    reader.readAsDataURL(file);
  }, []);

  const removeScreenshot = useCallback(() => {
    setScreenshot(null);
    setScreenshotPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  // Collect device info
  const collectDeviceInfo = useCallback((): DeviceInfo => {
    const ua = navigator.userAgent.toLowerCase();
    let platform: 'ios' | 'android' | 'web' = 'web';
    if (ua.includes('iphone') || ua.includes('ipad')) platform = 'ios';
    else if (ua.includes('android')) platform = 'android';

    return {
      platform,
      userAgent: navigator.userAgent,
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
    };
  }, []);

  // Submit handler
  const handleSubmit = useCallback(async () => {
    // Validate
    if (message.trim().length < MIN_MESSAGE_LENGTH) {
      setErrorMessage(`Please write at least ${MIN_MESSAGE_LENGTH} characters.`);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      // Get the user's access token for the API route
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setErrorMessage('Please sign in to submit feedback.');
        setIsSubmitting(false);
        return;
      }

      // Convert screenshot to base64 if present
      let screenshotBase64: string | null = null;
      if (screenshot) {
        const buffer = await screenshot.arrayBuffer();
        screenshotBase64 = btoa(
          new Uint8Array(buffer).reduce(
            (data, byte) => data + String.fromCharCode(byte),
            ''
          )
        );
      }

      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          category,
          message: message.trim(),
          screenshotBase64,
          deviceInfo: collectDeviceInfo(),
          appVersion,
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        setErrorMessage(result.error ?? 'Something went wrong. Please try again.');
        setSubmitState('error');
      } else {
        setSubmitState('success');
      }
    } catch {
      setErrorMessage('Network error. Please check your connection and try again.');
      setSubmitState('error');
    } finally {
      setIsSubmitting(false);
    }
  }, [category, message, screenshot, supabase, collectDeviceInfo, appVersion]);

  // Character count
  const charCount = message.length;
  const isOverLimit = charCount > MAX_MESSAGE_LENGTH;
  const isUnderMin = charCount > 0 && charCount < MIN_MESSAGE_LENGTH;

  return (
    <>
      {/* Floating Action Button */}
      <button
        onClick={() => setIsOpen(true)}
        aria-label="Send feedback"
        style={{
          position: 'fixed',
          bottom: `${bottomOffset + 8}px`,
          right: '16px',
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          backgroundColor: '#C0E863',
          border: 'none',
          cursor: 'pointer',
          display: isOpen ? 'none' : 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
          transition: 'transform 0.2s, opacity 0.2s',
        }}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path
            d="M18 0H2C0.9 0 0 0.9 0 2v12c0 1.1 0.9 2 2 2h14l4 4V2c0-1.1-0.9-2-2-2zM16 12H4v-2h12v2zm0-3H4V7h12v2zm0-3H4V4h12v2z"
            fill="#272D34"
          />
        </svg>
      </button>

      {/* Overlay */}
      {isOpen && (
        <div
          onClick={handleClose}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 1001,
            transition: 'opacity 0.3s',
          }}
        />
      )}

      {/* Bottom Sheet */}
      <div
        style={{
          position: 'fixed',
          bottom: isOpen ? '0' : '-100%',
          left: 0,
          right: 0,
          backgroundColor: '#1e2328',
          borderRadius: '16px 16px 0 0',
          zIndex: 1002,
          transition: 'bottom 0.3s ease',
          padding: '0 16px 24px',
          maxHeight: '85vh',
          overflowY: 'auto',
        }}
      >
        {/* Drag handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 6px' }}>
          <div
            style={{
              width: '36px',
              height: '4px',
              backgroundColor: '#444',
              borderRadius: '2px',
            }}
          />
        </div>

        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
          }}
        >
          <h2 style={{ color: '#fff', fontSize: '16px', fontWeight: 500, margin: 0 }}>
            Send feedback
          </h2>
          <button
            onClick={handleClose}
            aria-label="Close"
            style={{
              background: 'none',
              border: 'none',
              color: '#B1B3B6',
              fontSize: '22px',
              cursor: 'pointer',
              padding: '4px',
              lineHeight: 1,
            }}
          >
            &times;
          </button>
        </div>

        {submitState === 'success' ? (
          /* Success state */
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="#C0E863">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
            </svg>
            <p style={{ color: '#fff', fontSize: '15px', fontWeight: 500, margin: '12px 0 4px' }}>
              Thanks for your feedback!
            </p>
            <p style={{ color: '#B1B3B6', fontSize: '12px', margin: 0 }}>
              We will review it shortly.
            </p>
          </div>
        ) : (
          /* Form */
          <>
            {/* Category selector */}
            <p style={{ color: '#B1B3B6', fontSize: '11px', margin: '0 0 8px' }}>Category</p>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  onClick={() => setCategory(cat.value)}
                  style={{
                    fontSize: '12px',
                    padding: '6px 14px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    border:
                      category === cat.value
                        ? '1px solid #C0E863'
                        : '1px solid transparent',
                    backgroundColor:
                      category === cat.value
                        ? 'rgba(192, 232, 99, 0.15)'
                        : '#333a42',
                    color: category === cat.value ? '#C0E863' : '#B1B3B6',
                    transition: 'all 0.15s',
                    fontFamily: 'inherit',
                  }}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Message textarea */}
            <div style={{ marginBottom: '4px', display: 'flex', justifyContent: 'space-between' }}>
              <p style={{ color: '#B1B3B6', fontSize: '11px', margin: 0 }}>Message</p>
              <p
                style={{
                  fontSize: '11px',
                  margin: 0,
                  color: isOverLimit ? '#E24B4A' : isUnderMin ? '#EF9F27' : '#555',
                }}
              >
                {charCount > 0 ? `${charCount}/${MAX_MESSAGE_LENGTH}` : ''}
              </p>
            </div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Tell us what's on your mind..."
              maxLength={MAX_MESSAGE_LENGTH + 100} // soft limit, validated on submit
              style={{
                width: '100%',
                height: '100px',
                backgroundColor: '#272D34',
                border: `1px solid ${errorMessage ? '#E24B4A' : '#3a4048'}`,
                borderRadius: '8px',
                color: '#fff',
                fontSize: '13px',
                padding: '10px',
                resize: 'none',
                boxSizing: 'border-box',
                fontFamily: 'inherit',
                outline: 'none',
              }}
            />

            {/* Screenshot attachment */}
            <div style={{ marginTop: '8px' }}>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleScreenshotSelect}
                style={{ display: 'none' }}
              />

              {!screenshot ? (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    cursor: 'pointer',
                    padding: '8px 0',
                    background: 'none',
                    border: 'none',
                    fontFamily: 'inherit',
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="#C0E863">
                    <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z" />
                  </svg>
                  <span style={{ color: '#C0E863', fontSize: '12px' }}>Attach screenshot</span>
                </button>
              ) : (
                <div
                  style={{
                    backgroundColor: '#272D34',
                    borderRadius: '8px',
                    padding: '8px 10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  {screenshotPreview && (
                    <img
                      src={screenshotPreview}
                      alt="Screenshot preview"
                      style={{
                        width: '32px',
                        height: '32px',
                        objectFit: 'cover',
                        borderRadius: '4px',
                      }}
                    />
                  )}
                  <span style={{ color: '#B1B3B6', fontSize: '12px', flex: 1 }}>
                    {screenshot.name.length > 24
                      ? `${screenshot.name.slice(0, 21)}...`
                      : screenshot.name}
                  </span>
                  <button
                    onClick={removeScreenshot}
                    style={{
                      color: '#666',
                      fontSize: '16px',
                      cursor: 'pointer',
                      background: 'none',
                      border: 'none',
                      padding: '0 4px',
                    }}
                  >
                    &times;
                  </button>
                </div>
              )}
            </div>

            {/* Error message */}
            {errorMessage && (
              <p style={{ color: '#E24B4A', fontSize: '12px', margin: '8px 0 0' }}>
                {errorMessage}
              </p>
            )}

            {/* Submit button */}
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || isOverLimit}
              style={{
                width: '100%',
                marginTop: '14px',
                padding: '12px',
                backgroundColor: isSubmitting ? '#8aaa4a' : '#C0E863',
                color: '#272D34',
                fontSize: '14px',
                fontWeight: 500,
                border: 'none',
                borderRadius: '10px',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                opacity: isSubmitting ? 0.7 : 1,
                transition: 'opacity 0.2s',
              }}
            >
              {isSubmitting ? 'Sending...' : 'Send feedback'}
            </button>
          </>
        )}
      </div>
    </>
  );
}
