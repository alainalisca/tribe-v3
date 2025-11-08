'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function SafetyPage() {
  return (
    <div className="min-h-screen bg-stone-50 dark:bg-[#52575D]">
      <div className="bg-stone-200 dark:bg-[#272D34] p-4 border-b border-stone-300 dark:border-black">
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          <Link href="/settings">
            <button className="p-2 hover:bg-stone-300 dark:hover:bg-[#52575D] rounded-lg transition">
              <ArrowLeft className="w-6 h-6 text-stone-900 dark:text-white" />
            </button>
          </Link>
          <h1 className="text-xl font-bold text-stone-900 dark:text-white">
            Safety Guidelines
          </h1>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-white dark:bg-[#272D34] rounded-xl p-8">
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-400 p-4 mb-6">
            <p className="font-semibold text-yellow-900 dark:text-yellow-200 mb-1">⚠️ Your Safety is Your Responsibility</p>
            <p className="text-sm text-yellow-800 dark:text-yellow-300">Tribe connects people but cannot verify identities or supervise sessions. Follow these guidelines to stay safe.</p>
          </div>

          <div className="space-y-6 text-stone-700 dark:text-gray-300">
            <section>
              <h2 className="text-2xl font-bold text-stone-900 dark:text-white mb-3">Before the Session</h2>
              <ul className="space-y-2">
                <li className="flex items-start gap-2">
                  <span className="text-tribe-green font-bold">✓</span>
                  <span>Check participant profiles, ratings, and past activity</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-tribe-green font-bold">✓</span>
                  <span>Choose public, well-lit meeting locations (parks, gyms, sports facilities)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-tribe-green font-bold">✓</span>
                  <span>Tell someone where you're going, who you're meeting, and when you'll be back</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-tribe-green font-bold">✓</span>
                  <span>Trust your instincts - if something feels off, don't go</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-tribe-green font-bold">✓</span>
                  <span>Review the session details and confirm the time/location with the host</span>
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-stone-900 dark:text-white mb-3">During the Session</h2>
              <ul className="space-y-2">
                <li className="flex items-start gap-2">
                  <span className="text-tribe-green font-bold">✓</span>
                  <span>Meet in public spaces where other people are present</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-tribe-green font-bold">✓</span>
                  <span>Keep your phone charged and accessible</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-tribe-green font-bold">✓</span>
                  <span>Stay in well-lit, populated areas</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-tribe-green font-bold">✓</span>
                  <span>Listen to your body and don't push beyond your limits</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-tribe-green font-bold">✓</span>
                  <span>If you feel unsafe at any point, leave immediately</span>
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-stone-900 dark:text-white mb-3">After the Session</h2>
              <ul className="space-y-2">
                <li className="flex items-start gap-2">
                  <span className="text-tribe-green font-bold">✓</span>
                  <span>Mark the session as complete in the app</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-tribe-green font-bold">✓</span>
                  <span>Leave an honest rating and review to help other users</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-tribe-green font-bold">✓</span>
                  <span>Report any concerning behavior immediately</span>
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-stone-900 dark:text-white mb-3">🚩 Red Flags - Be Cautious If Someone:</h2>
              <ul className="space-y-2">
                <li className="flex items-start gap-2">
                  <span className="text-red-500 font-bold">🚩</span>
                  <span>Pressures you to meet in private or isolated locations</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-500 font-bold">🚩</span>
                  <span>Sends inappropriate or uncomfortable messages</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-500 font-bold">🚩</span>
                  <span>Has no profile photo or very limited information</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-500 font-bold">🚩</span>
                  <span>Behaves aggressively, threateningly, or disrespectfully</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-500 font-bold">🚩</span>
                  <span>Asks for personal information (address, financial details, etc.)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-red-500 font-bold">🚩</span>
                  <span>Cancels or reschedules repeatedly at the last minute</span>
                </li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-stone-900 dark:text-white mb-3">Reporting Issues</h2>
              <p className="mb-3">If you experience harassment, inappropriate behavior, or safety concerns:</p>
              <ol className="list-decimal pl-6 space-y-2">
                <li>Leave the situation immediately if you feel unsafe</li>
                <li>Block and report the user in the app</li>
                <li>Contact local authorities if you're in immediate danger</li>
                <li>Email us with details: <a href="mailto:admin@aplusfitnessllc.com" className="text-tribe-green hover:underline">admin@aplusfitnessllc.com</a></li>
              </ol>
            </section>

            <section>
              <div className="bg-red-50 dark:bg-red-900/20 border-l-4 border-red-400 p-4">
                <h3 className="font-bold text-red-900 dark:text-red-200 mb-2">🚨 In an Emergency</h3>
                <p className="text-red-800 dark:text-red-300">Call local emergency services immediately:</p>
                <p className="font-semibold text-red-900 dark:text-red-200 mt-2">Colombia: 123 (Police/Medical/Fire)</p>
                <p className="font-semibold text-red-900 dark:text-red-200">USA: 911</p>
              </div>
            </section>

            <section>
              <div className="bg-lime-50 dark:bg-lime-900/20 border-l-4 border-lime-500 p-4">
                <p className="font-semibold text-lime-900 dark:text-lime-200 mb-2">Remember:</p>
                <p className="text-lime-800 dark:text-lime-300">Most Tribe users are genuine people looking for training partners. By following these guidelines and trusting your instincts, you can enjoy safe, productive training sessions.</p>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
