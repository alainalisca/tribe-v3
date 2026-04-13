/** Page: /feedback — Submit app feedback and bug reports */
'use client';

import { MessageSquare, Bug, ArrowLeft, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import BottomNav from '@/components/BottomNav';
import { useFeedback } from './useFeedback';

export default function FeedbackPage() {
  const {
    user,
    activeTab,
    setActiveTab,
    submitting,
    t,
    router,
    feedbackType,
    setFeedbackType,
    feedbackTitle,
    setFeedbackTitle,
    feedbackDescription,
    setFeedbackDescription,
    submitFeedback,
    bugTitle,
    setBugTitle,
    bugDescription,
    setBugDescription,
    bugSteps,
    setBugSteps,
    bugSeverity,
    setBugSeverity,
    submitBugReport,
  } = useFeedback();

  if (!user) {
    return <div className="min-h-screen bg-theme-page flex items-center justify-center"></div>;
  }

  return (
    <div className="min-h-screen bg-theme-page pb-32">
      {/* Header */}
      <div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-theme-card border-b border-theme">
        <div className="max-w-2xl mx-auto h-14 flex items-center px-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="mr-3">
            <ArrowLeft className="w-6 h-6 text-theme-primary" />
          </Button>
          <h1 className="text-xl font-bold text-theme-primary">
            {t.pageTitle} Tribe<span className="text-tribe-green">.</span>
          </h1>
        </div>
      </div>

      <div className="pt-header max-w-2xl mx-auto p-4">
        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-theme">
          <button
            onClick={() => setActiveTab('feedback')}
            className={`flex items-center gap-2 px-4 py-3 font-medium transition ${
              activeTab === 'feedback' ? 'border-b-2 border-tribe-green text-theme-primary' : 'text-theme-secondary'
            }`}
          >
            <MessageSquare className="w-5 h-5" />
            {t.feedback}
          </button>
          <button
            onClick={() => setActiveTab('bug')}
            className={`flex items-center gap-2 px-4 py-3 font-medium transition ${
              activeTab === 'bug' ? 'border-b-2 border-tribe-green text-theme-primary' : 'text-theme-secondary'
            }`}
          >
            <Bug className="w-5 h-5" />
            {t.bugReport}
          </button>
        </div>

        {/* Feedback Form */}
        {activeTab === 'feedback' && (
          <Card className="dark:bg-tribe-card">
            <CardContent className="p-6">
              <h2 className="text-lg font-bold text-theme-primary mb-4">{t.shareIdeas}</h2>
              <p className="text-sm text-theme-secondary mb-6">{t.shareIdeasDesc}</p>

              <div className="space-y-4">
                <div>
                  <Label className="dark:text-gray-300 mb-2">{t.type} *</Label>
                  <select
                    value={feedbackType}
                    onChange={(e) => setFeedbackType(e.target.value)}
                    className="w-full p-3 border border-stone-300 dark:border-[#52575D] rounded-lg focus:outline-none focus:ring-2 focus:ring-tribe-green text-stone-900 dark:text-white bg-white dark:bg-tribe-mid"
                  >
                    <option value="feature_request">{t.featureRequest}</option>
                    <option value="general">{t.general}</option>
                  </select>
                </div>

                <div>
                  <Label className="dark:text-gray-300 mb-2">{t.title} *</Label>
                  <Input
                    type="text"
                    value={feedbackTitle}
                    onChange={(e) => setFeedbackTitle(e.target.value)}
                    placeholder={t.titlePlaceholder}
                    className="h-auto py-3 dark:border-[#52575D] focus:ring-tribe-green text-stone-900 dark:text-white bg-white dark:bg-tribe-mid"
                  />
                </div>

                <div>
                  <Label className="dark:text-gray-300 mb-2">{t.description} *</Label>
                  <Textarea
                    value={feedbackDescription}
                    onChange={(e) => setFeedbackDescription(e.target.value)}
                    placeholder={t.descriptionPlaceholder}
                    className="h-32 resize-none dark:border-[#52575D] focus:ring-tribe-green text-stone-900 dark:text-white bg-white dark:bg-tribe-mid"
                  />
                </div>

                <Button
                  onClick={submitFeedback}
                  disabled={submitting}
                  className="w-full flex items-center justify-center gap-2 font-bold"
                >
                  <Send className="w-5 h-5" />
                  {submitting ? t.submitting : t.submitFeedback}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Bug Report Form */}
        {activeTab === 'bug' && (
          <Card className="dark:bg-tribe-card">
            <CardContent className="p-6">
              <h2 className="text-lg font-bold text-theme-primary mb-4">{t.reportBug}</h2>
              <p className="text-sm text-theme-secondary mb-6">{t.reportBugDesc}</p>

              <div className="space-y-4">
                <div>
                  <Label className="dark:text-gray-300 mb-2">{t.title} *</Label>
                  <Input
                    type="text"
                    value={bugTitle}
                    onChange={(e) => setBugTitle(e.target.value)}
                    placeholder={t.bugTitlePlaceholder}
                    className="h-auto py-3 dark:border-[#52575D] focus:ring-tribe-green text-stone-900 dark:text-white bg-white dark:bg-tribe-mid"
                  />
                </div>

                <div>
                  <Label className="dark:text-gray-300 mb-2">{t.whatHappened} *</Label>
                  <Textarea
                    value={bugDescription}
                    onChange={(e) => setBugDescription(e.target.value)}
                    placeholder={t.whatHappenedPlaceholder}
                    className="h-24 resize-none dark:border-[#52575D] focus:ring-tribe-green text-stone-900 dark:text-white bg-white dark:bg-tribe-mid"
                  />
                </div>

                <div>
                  <Label className="dark:text-gray-300 mb-2">{t.stepsToReproduce}</Label>
                  <Textarea
                    value={bugSteps}
                    onChange={(e) => setBugSteps(e.target.value)}
                    placeholder={t.stepsPlaceholder}
                    className="h-24 resize-none dark:border-[#52575D] focus:ring-tribe-green text-stone-900 dark:text-white bg-white dark:bg-tribe-mid"
                  />
                </div>

                <div>
                  <Label className="dark:text-gray-300 mb-2">{t.severity} *</Label>
                  <select
                    value={bugSeverity}
                    onChange={(e) => setBugSeverity(e.target.value)}
                    className="w-full p-3 border border-stone-300 dark:border-[#52575D] rounded-lg focus:outline-none focus:ring-2 focus:ring-tribe-green text-stone-900 dark:text-white bg-white dark:bg-tribe-mid"
                  >
                    <option value="low">{t.low}</option>
                    <option value="medium">{t.medium}</option>
                    <option value="high">{t.high}</option>
                    <option value="critical">{t.critical}</option>
                  </select>
                </div>

                <button
                  onClick={submitBugReport}
                  disabled={submitting}
                  className="w-full py-3 bg-red-500 text-white font-bold rounded-lg hover:bg-red-600 transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Bug className="w-5 h-5" />
                  {submitting ? t.submitting : t.submitBug}
                </button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
