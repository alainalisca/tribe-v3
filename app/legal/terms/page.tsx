'use client';

import { useLanguage } from '@/lib/LanguageContext';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function TermsPage() {
  const { language } = useLanguage();
  const t = language === 'es' ? {
    title: 'Términos de Servicio',
    note: 'Nota: Este documento legal está disponible en inglés.',
    lastUpdated: 'Última actualización',
  } : {
    title: 'Terms of Service',
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
            Terms of Service
          </h1>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-white dark:bg-[#272D34] rounded-xl p-8">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">Last Updated: November 24, 2025</p>
          
          <div className="space-y-6">
            <section>
              <h2 className="text-2xl font-bold text-stone-900 dark:text-white mb-3">1. ACCEPTANCE OF TERMS</h2>
              <p className="text-stone-700 dark:text-gray-300 mb-3">By accessing, downloading, or using the Tribe mobile application, website, or related services (collectively, the "Platform"), you agree to be bound by these Terms of Service ("Terms") and our Privacy Policy, which is incorporated herein by reference.</p>
              <p className="text-stone-700 dark:text-gray-300 mb-3">If you do not agree to these Terms, you must not access or use Tribe.</p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-stone-900 dark:text-white mb-3">2. ELIGIBILITY</h2>
              <p className="text-stone-700 dark:text-gray-300 mb-3">To use Tribe, you must:</p>
              <ul className="list-disc pl-6 space-y-2 text-stone-700 dark:text-gray-300 mb-3">
                <li>Be at least 18 years of age (or the age of legal majority in your jurisdiction, if higher);</li>
                <li>Have the legal capacity to enter into binding contracts; and</li>
                <li>Use the Platform only for lawful purposes and in compliance with all applicable laws.</li>
              </ul>
              <p className="text-stone-700 dark:text-gray-300 mb-3">By creating an account, you represent and warrant that all information you provide is true, accurate, and complete.</p>
              <p className="text-sm italic text-stone-600 dark:text-gray-400">Tribe is operated by A Plus Fitness LLC, a New York limited liability company, and is currently in beta testing in Medellín, Colombia.</p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-stone-900 dark:text-white mb-3">3. WHAT TRIBE IS</h2>
              <p className="text-stone-700 dark:text-gray-300 mb-3">Tribe is a digital platform designed to help users connect for sports, fitness, and training activities. Tribe facilitates introductions and coordination between users, but Tribe is not a service provider, employer, agent, or guarantor of any activity arranged through the Platform.</p>
              <p className="text-stone-700 dark:text-gray-300 mb-2">You acknowledge that:</p>
              <ul className="list-disc pl-6 space-y-2 text-stone-700 dark:text-gray-300 mb-3">
                <li>Tribe does not provide or supervise any training, coaching, or exercise services.</li>
                <li>Tribe does not verify the identity, qualifications, certifications, or backgrounds of users.</li>
                <li>Tribe does not oversee, monitor, or control the actions or conduct of any users, whether during in-person activities or communications via the Platform.</li>
                <li>All users act independently and at their own risk.</li>
              </ul>
              <p className="text-sm italic text-stone-600 dark:text-gray-400">While Tribe may be accessed internationally, these Terms are governed by U.S. law and the Platform is operated from New York.</p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-stone-900 dark:text-white mb-3">4. HEALTH AND ASSUMPTION OF RISK</h2>
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-400 p-4 my-4">
                <p className="font-semibold text-yellow-900 dark:text-yellow-200">⚠️ IMPORTANT - READ CAREFULLY</p>
              </div>
              <p className="text-stone-700 dark:text-gray-300 mb-3">Physical activity and sports inherently involve risk, including but not limited to serious injury, permanent disability, or death. By participating in any activity arranged through Tribe, you agree that:</p>
              <ul className="list-disc pl-6 space-y-2 text-stone-700 dark:text-gray-300 mb-3">
                <li>You voluntarily assume all risks, known and unknown, associated with such participation.</li>
                <li>You are solely responsible for evaluating your own physical condition, limitations, and skill level.</li>
                <li>You should consult a qualified physician before engaging in any strenuous physical activity.</li>
                <li>Tribe is not liable for any injuries, accidents, property damage, or losses arising out of or related to participation in any activity coordinated via the Platform.</li>
              </ul>
              <p className="text-stone-700 dark:text-gray-300">Tribe disclaims all warranties, express or implied, regarding safety, suitability, or outcomes of any activities or sessions arranged through the Platform.</p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-stone-900 dark:text-white mb-3">5. USER RESPONSIBILITIES AND CONDUCT</h2>
              <p className="text-stone-700 dark:text-gray-300 mb-3">You agree to use the Platform responsibly and lawfully. You must not:</p>
              <ul className="list-disc pl-6 space-y-2 text-stone-700 dark:text-gray-300 mb-3">
                <li>Harass, stalk, threaten, intimidate, or harm any person;</li>
                <li>Post, upload, or transmit any false, misleading, obscene, or defamatory material;</li>
                <li>Impersonate another individual or entity;</li>
                <li>Engage in fraud, deception, or misrepresentation;</li>
                <li>Use Tribe for commercial solicitation, spamming, or advertising;</li>
                <li>Violate any local, national, or international law or regulation; or</li>
                <li>Upload or share content that infringes intellectual property, privacy, or publicity rights of others.</li>
              </ul>
              <p className="text-stone-700 dark:text-gray-300">Tribe reserves the right to investigate and take appropriate legal or administrative action (including account suspension or termination) in cases of misconduct.</p>
            </section>

            {/* Continue with remaining sections... I'll add them in the next part */}
            
            <section>
              <h2 className="text-2xl font-bold text-stone-900 dark:text-white mb-3">12. DISPUTE RESOLUTION</h2>
              <p className="text-stone-700 dark:text-gray-300 mb-3"><strong>Between Users:</strong> Tribe is not responsible for mediating or resolving disputes between users. You must resolve any disputes directly.</p>
              <p className="text-stone-700 dark:text-gray-300"><strong>With Tribe:</strong> These Terms and any dispute with Tribe shall be governed by and construed in accordance with the laws of the State of New York, United States, without regard to its conflict of laws principles. You agree to submit to the exclusive jurisdiction of the state and federal courts located in New York County, New York.</p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-stone-900 dark:text-white mb-3">15. CONTACT INFORMATION</h2>
              <p className="text-stone-700 dark:text-gray-300 mb-3">Questions, legal concerns, or requests regarding these Terms may be directed to:</p>
              <div className="bg-gray-100 dark:bg-[#52575D] p-4 rounded-lg">
                <p className="font-semibold text-stone-900 dark:text-white">Email: <a href="mailto:admin@aplusfitnessllc.com" className="text-tribe-green hover:underline">admin@aplusfitnessllc.com</a></p>
                <p className="text-sm mt-2 text-stone-700 dark:text-gray-300">Business Name: A Plus Fitness LLC</p>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
