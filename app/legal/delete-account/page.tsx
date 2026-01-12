'use client';

import Link from 'next/link';
import { ArrowLeft, Mail, Trash2, Clock, AlertTriangle } from 'lucide-react';
import { useLanguage } from '@/lib/LanguageContext';

export default function DeleteAccountPage() {
  const { language } = useLanguage();

  const t = language === 'es' ? {
    title: 'Eliminar Cuenta',
    subtitle: 'Instrucciones para Eliminación de Cuenta',
    note: 'Nota: Este documento legal está disponible en inglés.',
    intro: 'Respetamos tu derecho a eliminar tu cuenta y todos los datos asociados. Esta página explica qué sucede cuando eliminas tu cuenta y cómo solicitar la eliminación.',
    whatDeleted: 'Qué Se Elimina',
    whatDeletedDesc: 'Cuando eliminas tu cuenta de Tribe, los siguientes datos se eliminan permanentemente:',
    profileInfo: 'Información de perfil (nombre, correo electrónico, foto de perfil, biografía)',
    sessionData: 'Historial de sesiones de entrenamiento y participación',
    messages: 'Mensajes y conversaciones',
    locationData: 'Datos de ubicación e historial de búsqueda',
    preferences: 'Preferencias y configuración de la aplicación',
    notifications: 'Tokens de notificaciones push',
    retention: 'Período de Retención de Datos',
    retentionDesc: 'Después de la solicitud de eliminación:',
    retentionDays: 'Tus datos se eliminan permanentemente dentro de 30 días',
    retentionRecovery: 'Durante este período, puedes contactarnos para cancelar la solicitud de eliminación',
    retentionLegal: 'Algunos datos pueden conservarse más tiempo si lo requiere la ley (por ejemplo, registros de transacciones)',
    howToDelete: 'Cómo Eliminar Tu Cuenta',
    option1Title: 'Opción 1: A través de la App (Recomendado)',
    option1Steps: [
      'Abre Tribe e inicia sesión',
      'Ve a Perfil → Configuración',
      'Desplázate hacia abajo hasta "Eliminar Cuenta"',
      'Confirma tu decisión',
      'Tu cuenta se programará para eliminación'
    ],
    option2Title: 'Opción 2: Solicitud por Correo Electrónico',
    option2Desc: 'Si no puedes acceder a tu cuenta o prefieres solicitar la eliminación por correo electrónico:',
    emailSubject: 'Asunto',
    emailSubjectText: 'Solicitud de Eliminación de Cuenta - Tribe',
    emailInclude: 'Incluir en tu correo',
    emailIncludeItems: [
      'Tu nombre completo',
      'Dirección de correo electrónico asociada a tu cuenta de Tribe',
      'Motivo de la eliminación (opcional)'
    ],
    emailSendTo: 'Envía tu solicitud a:',
    responseTime: 'Tiempo de Respuesta',
    responseTimeDesc: 'Procesaremos tu solicitud dentro de 7 días hábiles y te enviaremos un correo de confirmación una vez que tu cuenta haya sido eliminada.',
    beforeDelete: 'Antes de Eliminar',
    beforeDeleteDesc: 'Por favor considera:',
    beforeDeleteItems: [
      'La eliminación es permanente e irreversible después del período de 30 días',
      'Perderás acceso a todas las sesiones y conversaciones',
      'Otros usuarios ya no podrán ver tu perfil',
      'Cualquier sesión activa que estés organizando será cancelada'
    ],
    questions: 'Preguntas?',
    questionsDesc: 'Si tienes preguntas sobre la eliminación de tu cuenta o tus datos, contáctanos en:',
  } : {
    title: 'Delete Account',
    subtitle: 'Account Deletion Instructions',
    note: '',
    intro: 'We respect your right to delete your account and all associated data. This page explains what happens when you delete your account and how to request deletion.',
    whatDeleted: 'What Gets Deleted',
    whatDeletedDesc: 'When you delete your Tribe account, the following data is permanently removed:',
    profileInfo: 'Profile information (name, email, profile photo, bio)',
    sessionData: 'Workout session history and participation records',
    messages: 'Messages and conversations',
    locationData: 'Location data and search history',
    preferences: 'App preferences and settings',
    notifications: 'Push notification tokens',
    retention: 'Data Retention Period',
    retentionDesc: 'After deletion request:',
    retentionDays: 'Your data is permanently deleted within 30 days',
    retentionRecovery: 'During this period, you can contact us to cancel the deletion request',
    retentionLegal: 'Some data may be retained longer if required by law (e.g., transaction records)',
    howToDelete: 'How to Delete Your Account',
    option1Title: 'Option 1: Through the App (Recommended)',
    option1Steps: [
      'Open Tribe and sign in to your account',
      'Go to Profile → Settings',
      'Scroll down to "Delete Account"',
      'Confirm your decision',
      'Your account will be scheduled for deletion'
    ],
    option2Title: 'Option 2: Email Request',
    option2Desc: 'If you cannot access your account or prefer to request deletion via email:',
    emailSubject: 'Subject',
    emailSubjectText: 'Account Deletion Request - Tribe',
    emailInclude: 'Include in your email',
    emailIncludeItems: [
      'Your full name',
      'Email address associated with your Tribe account',
      'Reason for deletion (optional)'
    ],
    emailSendTo: 'Send your request to:',
    responseTime: 'Response Time',
    responseTimeDesc: 'We will process your request within 7 business days and send you a confirmation email once your account has been deleted.',
    beforeDelete: 'Before You Delete',
    beforeDeleteDesc: 'Please consider:',
    beforeDeleteItems: [
      'Deletion is permanent and irreversible after the 30-day period',
      'You will lose access to all sessions and conversations',
      'Other users will no longer be able to see your profile',
      'Any active sessions you are hosting will be cancelled'
    ],
    questions: 'Questions?',
    questionsDesc: 'If you have questions about deleting your account or your data, contact us at:',
  };

  const contactEmail = 'alainalisca@aplusfitnesslls.com';

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
                <li>{t.profileInfo}</li>
                <li>{t.sessionData}</li>
                <li>{t.messages}</li>
                <li>{t.locationData}</li>
                <li>{t.preferences}</li>
                <li>{t.notifications}</li>
              </ul>
            </section>

            {/* Data Retention */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-6 h-6 text-tribe-green" />
                <h3 className="text-xl font-bold text-stone-900 dark:text-white">{t.retention}</h3>
              </div>
              <p className="mb-3">{t.retentionDesc}</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>{t.retentionDays}</li>
                <li>{t.retentionRecovery}</li>
                <li>{t.retentionLegal}</li>
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
              <div className="bg-gray-100 dark:bg-[#52575D] rounded-lg p-4">
                <h4 className="font-bold text-stone-900 dark:text-white mb-3">{t.option2Title}</h4>
                <p className="mb-4">{t.option2Desc}</p>

                <div className="space-y-3">
                  <div>
                    <span className="font-semibold">{t.emailSubject}:</span>
                    <code className="ml-2 bg-gray-200 dark:bg-[#272D34] px-2 py-1 rounded text-sm">
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
              <a
                href={`mailto:${contactEmail}`}
                className="text-tribe-green hover:underline font-semibold"
              >
                {contactEmail}
              </a>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
