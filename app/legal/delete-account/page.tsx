/** Page: /legal/delete-account — Account deletion request page */
'use client';

import Link from 'next/link';
import { ArrowLeft, Mail, Trash2, Clock, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useLanguage } from '@/lib/LanguageContext';

export default function DeleteAccountPage() {
  const { language } = useLanguage();

  // What deletion does (lib/account/deleteAccount and migration 228, T-DEL1),
  // and nothing more: all of it at once. There is no 30-day purge, no recovery
  // window and no automatic confirmation email; the page used to promise all
  // three, while the code anonymised nothing. The page and the code ship together.
  const t =
    language === 'es'
      ? {
          title: 'Eliminar Cuenta',
          subtitle: 'Instrucciones para Eliminación de Cuenta',
          intro:
            'Respetamos tu derecho a eliminar tu cuenta. Esta página explica qué pasa cuando la eliminas y cómo solicitarlo.',
          whatDeleted: 'Qué Se Elimina',
          whatDeletedDesc: 'Cuando confirmas la eliminación en la app, esto ocurre de inmediato:',
          deletedItems: [
            'Se borra tu perfil: nombre, correo, nombre de usuario, biografía, ubicación, redes sociales, certificaciones, especialidades y video',
            'Se borran tus datos privados: datos bancarios, documento de identidad, contacto de emergencia y fecha de nacimiento',
            'Se borran de nuestro almacenamiento las fotos y videos que subiste: foto de perfil, portada, galería, fotos de sesiones, historias y Momentos',
            'Se borran tus publicaciones en comunidades y tus etiquetas en fotos de otras personas',
            'Se borra a quién sigues, quién te sigue y tus conexiones',
            'Se elimina tu inicio de sesión: ya no podrás entrar con esa cuenta',
            'Se cancelan las sesiones futuras que organizas y tus cupos en sesiones futuras',
          ],
          retention: 'Qué Se Conserva',
          retentionDesc: 'Esto se conserva, sin tu nombre ni tus datos de contacto, bajo "Usuario eliminado":',
          retentionItems: [
            'El historial de sesiones pasadas y los mensajes que enviaste',
            'Las reseñas que dejaste a entrenadores, con sus estrellas y su texto',
            'Los registros que la ley nos obligue a conservar (por ejemplo, de pagos)',
          ],
          howToDelete: 'Cómo Eliminar Tu Cuenta',
          option1Title: 'Opción 1: A través de la App (Recomendado)',
          option1Steps: [
            'Abre Tribe e inicia sesión',
            'Ve a Perfil → Configuración',
            'Desplázate hacia abajo hasta "Eliminar Cuenta"',
            'Confirma tu decisión',
            'Tu cuenta se elimina en ese momento',
          ],
          option2Title: 'Opción 2: Solicitud por Correo Electrónico',
          option2Desc: 'Si no puedes acceder a tu cuenta o prefieres solicitar la eliminación por correo electrónico:',
          emailSubject: 'Asunto',
          emailSubjectText: 'Solicitud de Eliminación de Cuenta - Tribe',
          emailInclude: 'Incluir en tu correo',
          emailIncludeItems: [
            'Tu nombre completo',
            'Dirección de correo electrónico asociada a tu cuenta de Tribe',
            'Motivo de la eliminación (opcional)',
          ],
          emailSendTo: 'Envía tu solicitud a:',
          responseTime: 'Tiempo de Respuesta',
          responseTimeDesc:
            'Procesamos las solicitudes por correo dentro de 7 días hábiles y te respondemos a ese mismo correo cuando tu cuenta esté eliminada.',
          beforeDelete: 'Antes de Eliminar',
          beforeDeleteDesc: 'Por favor considera:',
          beforeDeleteItems: [
            'La eliminación es inmediata y no se puede deshacer',
            'Perderás acceso a todas las sesiones y conversaciones',
            'Otros usuarios ya no podrán ver tu perfil',
            'Las sesiones futuras que organizas se cancelarán',
          ],
          questions: '¿Preguntas?',
          questionsDesc: 'Si tienes preguntas sobre la eliminación de tu cuenta o tus datos, contáctanos en:',
        }
      : {
          title: 'Delete Account',
          subtitle: 'Account Deletion Instructions',
          intro:
            'We respect your right to delete your account. This page explains what happens when you delete it and how to request deletion.',
          whatDeleted: 'What Gets Deleted',
          whatDeletedDesc: 'When you confirm deletion in the app, this happens right away:',
          deletedItems: [
            'Your profile is erased: name, email, username, bio, location, social links, certifications, specialties and video',
            'Your private data is erased: bank details, ID document, emergency contact and date of birth',
            'The photos and videos you uploaded are erased from our storage: profile photo, cover, gallery, session photos, stories and Moments',
            "Your community posts are erased, and so are your tags on other people's photos",
            'Who you follow, who follows you and your connections are erased',
            'Your login is deleted, so you can no longer sign in to that account',
            'Upcoming sessions you host are cancelled, and so are your spots in upcoming sessions',
          ],
          retention: 'What We Keep',
          retentionDesc: 'This stays, without your name or contact details, under "Usuario eliminado":',
          retentionItems: [
            'Your past session history and the messages you sent',
            'The reviews you left for coaches, with their stars and text',
            'Records the law requires us to keep (for example, payments)',
          ],
          howToDelete: 'How to Delete Your Account',
          option1Title: 'Option 1: Through the App (Recommended)',
          option1Steps: [
            'Open Tribe and sign in to your account',
            'Go to Profile → Settings',
            'Scroll down to "Delete Account"',
            'Confirm your decision',
            'Your account is deleted right away',
          ],
          option2Title: 'Option 2: Email Request',
          option2Desc: 'If you cannot access your account or prefer to request deletion via email:',
          emailSubject: 'Subject',
          emailSubjectText: 'Account Deletion Request - Tribe',
          emailInclude: 'Include in your email',
          emailIncludeItems: [
            'Your full name',
            'Email address associated with your Tribe account',
            'Reason for deletion (optional)',
          ],
          emailSendTo: 'Send your request to:',
          responseTime: 'Response Time',
          responseTimeDesc:
            'We process email requests within 7 business days and reply to that same email once your account has been deleted.',
          beforeDelete: 'Before You Delete',
          beforeDeleteDesc: 'Please consider:',
          beforeDeleteItems: [
            'Deletion is immediate and cannot be undone',
            'You will lose access to all sessions and conversations',
            'Other users will no longer be able to see your profile',
            'Upcoming sessions you host will be cancelled',
          ],
          questions: 'Questions?',
          questionsDesc: 'If you have questions about deleting your account or your data, contact us at:',
        };

  const contactEmail = 'info@tribelatam.com';

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-tribe-mid safe-area-top">
      <div className="bg-stone-200 dark:bg-tribe-dark p-4 border-b border-stone-300 dark:border-black">
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          <Link href="/settings">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-6 h-6 text-stone-900 dark:text-white" />
            </Button>
          </Link>
          <h1 className="text-xl font-bold text-stone-900 dark:text-white">{t.title}</h1>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-6">
        <Card className="dark:bg-tribe-dark shadow-none border-none">
          <CardContent className="p-8">
            <h2 className="text-2xl font-bold text-stone-900 dark:text-white mb-4">{t.subtitle}</h2>
            <p className="text-stone-700 dark:text-gray-300 mb-8">{t.intro}</p>

            <div className="space-y-8 text-stone-700 dark:text-gray-300">
              {/* What Gets Deleted */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <Trash2 className="w-6 h-6 text-tribe-red" />
                  <h3 className="text-xl font-bold text-stone-900 dark:text-white">{t.whatDeleted}</h3>
                </div>
                <p className="mb-3">{t.whatDeletedDesc}</p>
                <ul className="list-disc pl-6 space-y-2">
                  {t.deletedItems.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </section>

              {/* What We Keep */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="w-6 h-6 text-tribe-green" />
                  <h3 className="text-xl font-bold text-stone-900 dark:text-white">{t.retention}</h3>
                </div>
                <p className="mb-3">{t.retentionDesc}</p>
                <ul className="list-disc pl-6 space-y-2">
                  {t.retentionItems.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </section>

              {/* How to Delete */}
              <section>
                <h3 className="text-xl font-bold text-stone-900 dark:text-white mb-4">{t.howToDelete}</h3>

                {/* Option 1 */}
                <div className="bg-lime-50 dark:bg-lime-900/20 border border-lime-200 dark:border-lime-800 rounded-lg p-4 mb-4">
                  <h4 className="font-bold text-lime-900 dark:text-lime-200 mb-3">{t.option1Title}</h4>
                  <ol className="list-decimal pl-6 space-y-2 text-lime-800 dark:text-lime-300">
                    {t.option1Steps.map((step, index) => (
                      <li key={index}>{step}</li>
                    ))}
                  </ol>
                </div>

                {/* Option 2 */}
                <div className="bg-stone-100 dark:bg-tribe-mid rounded-lg p-4">
                  <h4 className="font-bold text-stone-900 dark:text-white mb-3">{t.option2Title}</h4>
                  <p className="mb-4">{t.option2Desc}</p>

                  <div className="space-y-3">
                    <div>
                      <span className="font-semibold">{t.emailSubject}:</span>
                      <code className="ml-2 bg-stone-200 dark:bg-tribe-dark px-2 py-1 rounded text-sm">
                        {t.emailSubjectText}
                      </code>
                    </div>

                    <div>
                      <span className="font-semibold">{t.emailInclude}:</span>
                      <ul className="list-disc pl-6 mt-2 space-y-1">
                        {t.emailIncludeItems.map((item, index) => (
                          <li key={index}>{item}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="pt-2">
                      <span className="font-semibold">{t.emailSendTo}</span>
                      <div className="mt-2">
                        <a
                          href={`mailto:${contactEmail}?subject=${encodeURIComponent(t.emailSubjectText)}`}
                          className="inline-flex items-center gap-2 bg-tribe-green text-tribe-dark px-4 py-2 rounded-lg font-semibold hover:bg-lime-400 transition"
                        >
                          <Mail className="w-5 h-5" />
                          {contactEmail}
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* Response Time */}
              <section>
                <h3 className="text-xl font-bold text-stone-900 dark:text-white mb-3">{t.responseTime}</h3>
                <p>{t.responseTimeDesc}</p>
              </section>

              {/* Before You Delete */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="w-6 h-6 text-amber-500" />
                  <h3 className="text-xl font-bold text-stone-900 dark:text-white">{t.beforeDelete}</h3>
                </div>
                <p className="mb-3">{t.beforeDeleteDesc}</p>
                <ul className="list-disc pl-6 space-y-2">
                  {t.beforeDeleteItems.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </section>

              {/* Questions */}
              <section className="border-t border-gray-200 dark:border-gray-600 pt-6">
                <h3 className="text-xl font-bold text-stone-900 dark:text-white mb-3">{t.questions}</h3>
                <p className="mb-3">{t.questionsDesc}</p>
                <a href={`mailto:${contactEmail}`} className="text-tribe-green hover:underline font-semibold">
                  {contactEmail}
                </a>
              </section>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
