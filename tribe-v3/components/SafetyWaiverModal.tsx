'use client';

import { useState } from 'react';
import Link from 'next/link';

interface SafetyWaiverModalProps {
  onAccept: () => void;
  onCancel: () => void;
}

export default function SafetyWaiverModal({ onAccept, onCancel }: SafetyWaiverModalProps) {
  const [acknowledged, setAcknowledged] = useState({
    platform: false,
    risks: false,
    guidelines: false,
    age: false
  });
  
  const allChecked = Object.values(acknowledged).every(v => v);
  
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-[#272D34] rounded-2xl p-8 max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-bold text-stone-900 dark:text-white mb-4">Safety First</h2>
        
        <p className="text-stone-600 dark:text-gray-300 mb-6">
          Before joining your first session, please acknowledge these important safety points:
        </p>
        
        <div className="space-y-4 mb-6">
          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={acknowledged.platform}
              onChange={(e) => setAcknowledged({
                ...acknowledged,
                platform: e.target.checked
              })}
              className="mt-1 w-5 h-5 accent-tribe-green"
            />
            <span className="text-sm text-stone-700 dark:text-gray-300 group-hover:text-stone-900 dark:group-hover:text-white">
              I understand Tribe is a coordination platform only and does not verify users or supervise sessions
            </span>
          </label>
          
          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={acknowledged.risks}
              onChange={(e) => setAcknowledged({
                ...acknowledged,
                risks: e.target.checked
              })}
              className="mt-1 w-5 h-5 accent-tribe-green"
            />
            <span className="text-sm text-stone-700 dark:text-gray-300 group-hover:text-stone-900 dark:group-hover:text-white">
              I assume all risks of participating in physical activities, including possible injury
            </span>
          </label>
          
          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={acknowledged.guidelines}
              onChange={(e) => setAcknowledged({
                ...acknowledged,
                guidelines: e.target.checked
              })}
              className="mt-1 w-5 h-5 accent-tribe-green"
            />
            <span className="text-sm text-stone-700 dark:text-gray-300 group-hover:text-stone-900 dark:group-hover:text-white">
              I will follow{' '}
              <Link 
                href="/legal/safety" 
                target="_blank" 
                className="underline text-tribe-green hover:text-tribe-green/80"
              >
                safety guidelines
              </Link>
              {' '}(meet in public, tell someone, etc.)
            </span>
          </label>
          
          <label className="flex items-start gap-3 cursor-pointer group">
            <input
              type="checkbox"
              checked={acknowledged.age}
              onChange={(e) => setAcknowledged({
                ...acknowledged,
                age: e.target.checked
              })}
              className="mt-1 w-5 h-5 accent-tribe-green"
            />
            <span className="text-sm text-stone-700 dark:text-gray-300 group-hover:text-stone-900 dark:group-hover:text-white">
              I'm 18 or older and physically able to participate in the activities I join
            </span>
          </label>
        </div>
        
        <div className="flex gap-3">
          <button
            onClick={onAccept}
            disabled={!allChecked}
            className="flex-1 bg-tribe-green text-slate-900 py-3 rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-tribe-green/90 transition"
          >
            I Understand and Accept
          </button>
          <button
            onClick={onCancel}
            className="px-6 py-3 border border-stone-300 dark:border-[#52575D] text-stone-900 dark:text-white rounded-lg hover:bg-stone-100 dark:hover:bg-[#52575D] transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
