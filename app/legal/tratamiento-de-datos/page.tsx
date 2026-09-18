/**
 * Page: /legal/tratamiento-de-datos — Política de Tratamiento de Datos Personales
 *
 * STUB. Al is writing the text.
 *
 * It exists ahead of its content because the pass form's consent checkbox has
 * to link somewhere, and the one thing it must not link to is /legal/privacy.
 * That page is a general privacy policy; this one is the Ley 1581 de 2012
 * authorisation for handing a person's name, WhatsApp and email to a third
 * party, which is the specific thing the checkbox asks permission for. Pointing
 * a data-transfer consent at a policy that does not describe the transfer is
 * worse than a dead link, because it looks answered.
 *
 * noindex until the text lands: a placeholder indexed as Tribe's data policy is
 * a liability, and the pass page links here with rel="noopener".
 */
'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useLanguage } from '@/lib/LanguageContext';
import { getDataPolicyContent } from '../legalTranslations';

export default function TratamientoDeDatosPage() {
  const { language } = useLanguage();
  const router = useRouter();
  const t = getDataPolicyContent(language);

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-tribe-mid safe-area-top">
      <div className="bg-stone-200 dark:bg-tribe-dark p-4 border-b border-stone-300 dark:border-black">
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()} aria-label="Back">
            <ArrowLeft className="w-6 h-6 text-stone-900 dark:text-white" />
          </Button>
          <h1 className="text-xl font-bold text-stone-900 dark:text-white">{t.title}</h1>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-6">
        <Card className="dark:bg-tribe-dark shadow-none border-none">
          <CardContent className="p-8">
            <div className="mb-6 rounded-lg border-2 border-tribe-green bg-tribe-green/20 p-4" role="status">
              {/* Green as a border and a wash, never as the text colour: no green
                  in the palette clears AA as small text on a light surface. */}
              <p className="font-bold text-tribe-dark">{t.pending}</p>
            </div>

            <div className="space-y-4 text-stone-700 dark:text-gray-300">
              {t.paragraphs.map((paragraph, i) => (
                <p key={i}>{paragraph}</p>
              ))}
              <p className="text-sm text-stone-600 dark:text-gray-400">{t.contact}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
