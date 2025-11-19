'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { MessageSquare, Bug, ArrowLeft, Send } from 'lucide-react';
import Link from 'next/link';
import BottomNav from '@/components/BottomNav';

export default function FeedbackPage() {
  const router = useRouter();
  const supabase = createClient();
  const [user, setUser] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'feedback' | 'bug'>('feedback');
  const [submitting, setSubmitting] = useState(false);

  // Feedback form
  const [feedbackType, setFeedbackType] = useState('feature_request');
  const [feedbackTitle, setFeedbackTitle] = useState('');
  const [feedbackDescription, setFeedbackDescription] = useState('');

  // Bug report form
  const [bugTitle, setBugTitle] = useState('');
  const [bugDescription, setBugDescription] = useState('');
  const [bugSteps, setBugSteps] = useState('');
  const [bugSeverity, setBugSeverity] = useState('medium');

  useEffect(() => {
    checkUser();
  }, []);

  async function checkUser() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push('/auth');
    } else {
      setUser(user);
    }
  }

  async function submitFeedback() {
    if (!feedbackTitle.trim() || !feedbackDescription.trim()) {
      alert('Please fill in all fields');
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('user_feedback')
        .insert({
          user_id: user.id,
          type: feedbackType,
          title: feedbackTitle,
          description: feedbackDescription,
        });

      if (error) throw error;

      alert('✅ Feedback submitted! We appreciate your input.');
      setFeedbackTitle('');
      setFeedbackDescription('');
    } catch (error: any) {
      alert('❌ Error: ' + error.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function submitBugReport() {
    if (!bugTitle.trim() || !bugDescription.trim()) {
      alert('Please fill in all required fields');
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('bug_reports')
        .insert({
          user_id: user.id,
          title: bugTitle,
          description: bugDescription,
          steps_to_reproduce: bugSteps,
          severity: bugSeverity,
        });

      if (error) throw error;

      alert('✅ Bug report submitted! We\'ll investigate this.');
      setBugTitle('');
      setBugDescription('');
      setBugSteps('');
      setBugSeverity('medium');
    } catch (error: any) {
      alert('❌ Error: ' + error.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-theme-page flex items-center justify-center">
        <p className="text-theme-primary">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-theme-page pb-20">
      {/* Header */}
      <div className="bg-theme-card p-4 border-b border-theme">
        <div className="max-w-2xl mx-auto flex items-center">
          <button onClick={() => router.back()} className="p-2 hover:bg-stone-200 rounded-lg transition mr-3">
            <ArrowLeft className="w-6 h-6 text-theme-primary" />
          </button>
          <h1 className="text-xl font-bold text-theme-primary">Help Improve Tribe</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4">
        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-theme">
          <button
            onClick={() => setActiveTab('feedback')}
            className={`flex items-center gap-2 px-4 py-3 font-medium transition ${
              activeTab === 'feedback'
                ? 'border-b-2 border-tribe-green text-theme-primary'
                : 'text-theme-secondary'
            }`}
          >
            <MessageSquare className="w-5 h-5" />
            Feedback
          </button>
          <button
            onClick={() => setActiveTab('bug')}
            className={`flex items-center gap-2 px-4 py-3 font-medium transition ${
              activeTab === 'bug'
                ? 'border-b-2 border-tribe-green text-theme-primary'
                : 'text-theme-secondary'
            }`}
          >
            <Bug className="w-5 h-5" />
            Bug Report
          </button>
        </div>

        {/* Feedback Form */}
        {activeTab === 'feedback' && (
          <div className="bg-white rounded-xl p-6 shadow">
            <h2 className="text-lg font-bold text-theme-primary mb-4">Share Your Ideas</h2>
            <p className="text-sm text-theme-secondary mb-6">
              Have a feature request or general feedback? We'd love to hear from you!
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Type *</label>
                <select
                  value={feedbackType}
                  onChange={(e) => setFeedbackType(e.target.value)}
                  className="w-full p-3 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-tribe-green"
                >
                  <option value="feature_request">Feature Request</option>
                  <option value="general">General Feedback</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Title *</label>
                <input
                  type="text"
                  value={feedbackTitle}
                  onChange={(e) => setFeedbackTitle(e.target.value)}
                  placeholder="Brief summary of your feedback"
                  className="w-full p-3 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-tribe-green"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Description *</label>
                <textarea
                  value={feedbackDescription}
                  onChange={(e) => setFeedbackDescription(e.target.value)}
                  placeholder="Tell us more about your idea or feedback..."
                  className="w-full p-3 border border-stone-300 rounded-lg h-32 resize-none focus:outline-none focus:ring-2 focus:ring-tribe-green"
                />
              </div>

              <button
                onClick={submitFeedback}
                disabled={submitting}
                className="w-full py-3 bg-tribe-green text-slate-900 font-bold rounded-lg hover:bg-lime-500 transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Send className="w-5 h-5" />
                {submitting ? 'Submitting...' : 'Submit Feedback'}
              </button>
            </div>
          </div>
        )}

        {/* Bug Report Form */}
        {activeTab === 'bug' && (
          <div className="bg-white rounded-xl p-6 shadow">
            <h2 className="text-lg font-bold text-theme-primary mb-4">Report a Bug</h2>
            <p className="text-sm text-theme-secondary mb-6">
              Found something broken? Let us know so we can fix it!
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Title *</label>
                <input
                  type="text"
                  value={bugTitle}
                  onChange={(e) => setBugTitle(e.target.value)}
                  placeholder="Brief description of the bug"
                  className="w-full p-3 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-tribe-green"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">What happened? *</label>
                <textarea
                  value={bugDescription}
                  onChange={(e) => setBugDescription(e.target.value)}
                  placeholder="Describe what went wrong..."
                  className="w-full p-3 border border-stone-300 rounded-lg h-24 resize-none focus:outline-none focus:ring-2 focus:ring-tribe-green"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Steps to reproduce (optional)</label>
                <textarea
                  value={bugSteps}
                  onChange={(e) => setBugSteps(e.target.value)}
                  placeholder="1. Go to...&#10;2. Click on...&#10;3. See error..."
                  className="w-full p-3 border border-stone-300 rounded-lg h-24 resize-none focus:outline-none focus:ring-2 focus:ring-tribe-green"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Severity *</label>
                <select
                  value={bugSeverity}
                  onChange={(e) => setBugSeverity(e.target.value)}
                  className="w-full p-3 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-tribe-green"
                >
                  <option value="low">Low - Minor issue</option>
                  <option value="medium">Medium - Annoying but usable</option>
                  <option value="high">High - Major problem</option>
                  <option value="critical">Critical - App is broken</option>
                </select>
              </div>

              <button
                onClick={submitBugReport}
                disabled={submitting}
                className="w-full py-3 bg-red-500 text-white font-bold rounded-lg hover:bg-red-600 transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Bug className="w-5 h-5" />
                {submitting ? 'Submitting...' : 'Submit Bug Report'}
              </button>
            </div>
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
