'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';

export default function PrivacyPage() {
  const { language } = useLanguage();
  
  const t = language === 'es' ? {
    title: 'Política de Privacidad',
    note: 'Nota: Este documento legal está disponible en inglés.',
    lastUpdated: 'Última actualización',
  } : {
    title: 'Privacy Policy',
    note: '',
    lastUpdated: 'Last Updated',
  };

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-[#52575D] safe-area-top">
      <div className="bg-stone-200 dark:bg-[#272D34] p-4 border-b border-stone-300 dark:border-black">
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          <Link href="/settings">
            <button className="p-2 hover:bg-stone-300 dark:hover:bg-[#52575D] rounded-lg transition">
              <ArrowLeft className="w-6 h-6 text-stone-900 dark:text-white" />
            </button>
          </Link>
          <h1 className="text-xl font-bold text-stone-900 dark:text-white">
            {t.title}
          </h1>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-white dark:bg-[#272D34] rounded-xl p-8">
          {language === 'es' && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 p-4 mb-6">
              <p className="text-blue-800 dark:text-blue-200">{t.note}</p>
            </div>
          )}
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">{t.lastUpdated}: November 24, 2025</p>
          
          <div className="space-y-6 text-stone-700 dark:text-gray-300">
            <section>
              <h2 className="text-2xl font-bold text-stone-900 dark:text-white mb-3">1. Information We Collect</h2>
              <p className="mb-2">We collect information you provide directly:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Account information: name, email, date of birth, phone (optional)</li>
                <li>Profile information: photos, bio, sports, skill levels, location (city)</li>
                <li>Usage data: sessions created/joined, messages sent, app activity</li>
                <li>Location data: approximate location when you use location features</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-stone-900 dark:text-white mb-3">2. How We Use Your Information</h2>
              <p className="mb-2">We use your information to:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Provide the Tribe service (match you with training partners)</li>
                <li>Send notifications about sessions and messages</li>
                <li>Improve the platform and user experience</li>
                <li>Prevent fraud, abuse, and ensure platform safety</li>
                <li>Communicate with you about updates and features</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-stone-900 dark:text-white mb-3">3. Information Sharing</h2>
              <p className="mb-2">We share your information with:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li><strong>Other users:</strong> Profile information (name, photo, bio, sports, location) is visible to other users</li>
                <li><strong>Service providers:</strong> Hosting (Vercel), database (Supabase), analytics (PostHog)</li>
                <li><strong>Legal requirements:</strong> When required by law or to protect rights and safety</li>
              </ul>
              <div className="bg-lime-50 dark:bg-lime-900/20 border-l-4 border-lime-500 p-4 mt-4">
                <p className="font-semibold text-lime-900 dark:text-lime-200">We DO NOT sell your personal information to third parties.</p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-stone-900 dark:text-white mb-3">4. Your Rights</h2>
              <p className="mb-2">You have the right to:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>Access your data (Settings → Download My Data)</li>
                <li>Update your information (Settings → Edit Profile)</li>
                <li>Delete your account (Settings → Delete Account)</li>
                <li>Opt out of promotional communications</li>
                <li>Request a copy of your data</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-stone-900 dark:text-white mb-3">5. Data Retention</h2>
              <p>We keep your data while your account is active. After you delete your account, we retain data for 30 days for recovery purposes, then permanently delete it. Some data may be retained longer if required by law.</p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-stone-900 dark:text-white mb-3">6. Security</h2>
              <p>We protect your data using industry-standard security measures including:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>HTTPS encryption for all data transmission</li>
                <li>Secure authentication and password hashing</li>
                <li>Regular security audits and updates</li>
                <li>Restricted access to personal data</li>
              </ul>
              <p className="mt-2">However, no system is 100% secure. We cannot guarantee absolute security.</p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-stone-900 dark:text-white mb-3">7. Children's Privacy</h2>
              <p>Tribe is not intended for users under 18. We do not knowingly collect information from children under 18. If we learn we have collected such information, we will delete it immediately.</p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-stone-900 dark:text-white mb-3">8. Changes to This Policy</h2>
              <p>We may update this Privacy Policy from time to time. We will notify you of significant changes via email or in-app notification.</p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-stone-900 dark:text-white mb-3">9. Contact Us</h2>
              <div className="bg-gray-100 dark:bg-[#52575D] p-4 rounded-lg">
                <p>Privacy questions or requests:</p>
                <p className="font-semibold mt-2">Email: <a href="mailto:admin@aplusfitnessllc.com" className="text-tribe-green hover:underline">admin@aplusfitnessllc.com</a></p>
                <p className="text-sm mt-2">Business Name: A Plus Fitness LLC</p>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
