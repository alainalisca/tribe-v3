'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

export interface AccordionItem {
  question: string;
  answer: string;
}

interface AccordionProps {
  items: AccordionItem[];
}

export default function Accordion({ items }: AccordionProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggle = (i: number) => setOpenIndex(openIndex === i ? null : i);

  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <div key={i} className="bg-tribe-surface border border-tribe-mid rounded-xl overflow-hidden">
          <button onClick={() => toggle(i)} className="w-full flex items-center justify-between px-6 py-4 text-left">
            <span className="font-semibold pr-4">{item.question}</span>
            <ChevronDown
              size={20}
              className={`shrink-0 text-gray-500 transition-transform ${openIndex === i ? 'rotate-180' : ''}`}
            />
          </button>
          {openIndex === i && <div className="px-6 pb-4 text-gray-400 text-sm leading-relaxed">{item.answer}</div>}
        </div>
      ))}
    </div>
  );
}
