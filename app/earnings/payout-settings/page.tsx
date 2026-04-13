'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/LanguageContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import BottomNav from '@/components/BottomNav';
import Link from 'next/link';
import { ArrowLeft, Building2, CreditCard, Save, Shield } from 'lucide-react';
import { showSuccess, showError } from '@/lib/toast';
import { logError } from '@/lib/logger';
import type { User } from '@supabase/supabase-js';

interface PayoutFormData {
  payout_method: 'wompi' | 'manual';
  payout_bank_name: string;
  payout_account_type: 'savings' | 'checking';
  payout_account_number: string;
  payout_document_type: 'CC' | 'CE' | 'NIT' | 'PP' | 'TI';
  payout_document_number: string;
}

const BANK_OPTIONS = [
  { value: 'bancolombia', label: 'Bancolombia' },
  { value: 'davivienda', label: 'Davivienda' },
  { value: 'bbva', label: 'BBVA Colombia' },
  { value: 'banco_bogota', label: 'Banco de Bogotá' },
  { value: 'nequi', label: 'Nequi' },
  { value: 'other', label: 'Otro / Other' },
];

const DOCUMENT_TYPES = [
  { value: 'CC', label: 'CC - Cédula de Ciudadanía' },
  { value: 'CE', label: 'CE - Cédula de Extranjería' },
  { value: 'NIT', label: 'NIT - Número de Identificación Tributaria' },
  { value: 'PP', label: 'PP - Pasaporte' },
  { value: 'TI', label: 'TI - Tarjeta de Identidad' },
];

function maskAccountNumber(value: string): string {
  if (!value) return '';
  // Keep last 4 digits visible, mask the rest
  const cleaned = value.replace(/\D/g, '');
  if (cleaned.length <= 4) return cleaned;
  return '*'.repeat(cleaned.length - 4) + cleaned.slice(-4);
}

function getTranslations(language: 'en' | 'es') {
  const translations = {
    en: {
      pageTitle: 'Payout Settings',
      backButton: 'Back to Earnings',
      loading: 'Loading payout settings...',
      error: 'Failed to load payout settings',
      tryAgain: 'Try Again',
      savingChanges: 'Saving...',
      save: 'Save Settings',
      settingsSaved: 'Payout settings saved successfully',
      instructorOnly: 'Only instructors can access payout settings',
      payoutMethod: 'Payout Method',
      payoutMethodDesc: 'Choose how you want to receive payments',
      methodWompi: 'Bank Transfer (Wompi)',
      methodManual: 'Manual Payout',
      manualNote:
        'Payouts are handled manually by the Tribe team. We will contact you with payment details when payouts are processed.',
      bankDetails: 'Bank Account Details',
      bankDetailsDesc: 'Information for bank transfers',
      bankName: 'Bank Name',
      accountType: 'Account Type',
      savings: 'Savings Account',
      checking: 'Checking Account',
      accountNumber: 'Account Number',
      accountNumberPlaceholder: 'Enter your account number',
      maskedWarning: 'Last 4 digits shown for security',
      documentType: 'Document Type',
      documentNumber: 'Document Number',
      documentNumberPlaceholder: 'Enter your document number',
      security: 'Security & Privacy',
      securityDesc: 'Your bank information is encrypted and stored securely',
      selectBank: 'Select a bank...',
      selectDocType: 'Select document type...',
      selectAccountType: 'Select account type...',
      selectPayoutMethod: 'Select payout method...',
      errorSaving: 'Error saving payout settings',
      errorLoading: 'Error loading payout settings',
      formIncomplete: 'Please fill in all required fields',
    },
    es: {
      pageTitle: 'Configuración de Pagos',
      backButton: 'Volver a Ganancias',
      loading: 'Cargando configuración de pagos...',
      error: 'No se pudieron cargar los ajustes de pago',
      tryAgain: 'Intentar de nuevo',
      savingChanges: 'Guardando...',
      save: 'Guardar Configuración',
      settingsSaved: 'Configuración de pagos guardada exitosamente',
      instructorOnly: 'Solo los instructores pueden acceder a la configuración de pagos',
      payoutMethod: 'Método de Pago',
      payoutMethodDesc: 'Elige cómo quieres recibir los pagos',
      methodWompi: 'Transferencia Bancaria (Wompi)',
      methodManual: 'Pago Manual',
      manualNote:
        'Los pagos se manejan manualmente por el equipo de Tribe. Nos pondremos en contacto contigo con los detalles de pago cuando se procesen los pagos.',
      bankDetails: 'Detalles de Cuenta Bancaria',
      bankDetailsDesc: 'Información para transferencias bancarias',
      bankName: 'Banco',
      accountType: 'Tipo de Cuenta',
      savings: 'Cuenta de Ahorros',
      checking: 'Cuenta Corriente',
      accountNumber: 'Número de Cuenta',
      accountNumberPlaceholder: 'Ingresa tu número de cuenta',
      maskedWarning: 'Últimos 4 dígitos mostrados por seguridad',
      documentType: 'Tipo de Documento',
      documentNumber: 'Número de Documento',
      documentNumberPlaceholder: 'Ingresa tu número de documento',
      security: 'Seguridad y Privacidad',
      securityDesc: 'Tu información bancaria está encriptada y almacenada de forma segura',
      selectBank: 'Selecciona un banco...',
      selectDocType: 'Selecciona tipo de documento...',
      selectAccountType: 'Selecciona tipo de cuenta...',
      selectPayoutMethod: 'Selecciona método de pago...',
      errorSaving: 'Error al guardar configuración de pagos',
      errorLoading: 'Error al cargar configuración de pagos',
      formIncomplete: 'Por favor completa todos los campos requeridos',
    },
  };

  return translations[language];
}

export default function PayoutSettingsPage() {
  const { language } = useLanguage();
  const router = useRouter();
  const supabase = createClient();
  const tr = getTranslations(language);

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [isInstructor, setIsInstructor] = useState(false);

  const [formData, setFormData] = useState<PayoutFormData>({
    payout_method: 'manual',
    payout_bank_name: '',
    payout_account_type: 'savings',
    payout_account_number: '',
    payout_document_type: 'CC',
    payout_document_number: '',
  });

  // Load user and payout settings
  useEffect(() => {
    loadSettings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadSettings() {
    try {
      setError(null);
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (!authUser) {
        router.push('/auth');
        return;
      }

      setUser(authUser);

      // Fetch user profile to check instructor status and get payout settings
      const { data: profileData, error: profileError } = await supabase
        .from('users')
        .select(
          'is_instructor, payout_method, payout_bank_name, payout_account_type, payout_account_number, payout_document_type, payout_document_number'
        )
        .eq('id', authUser.id)
        .single();

      if (profileError) {
        logError(profileError, { action: 'loadSettings' });
        setError('load_failed');
        return;
      }

      if (!profileData?.is_instructor) {
        setIsInstructor(false);
        setLoading(false);
        return;
      }

      setIsInstructor(true);

      // Populate form with existing data
      if (profileData) {
        setFormData({
          payout_method: profileData.payout_method || 'manual',
          payout_bank_name: profileData.payout_bank_name || '',
          payout_account_type: profileData.payout_account_type || 'savings',
          payout_account_number: profileData.payout_account_number || '',
          payout_document_type: profileData.payout_document_type || 'CC',
          payout_document_number: profileData.payout_document_number || '',
        });
      }
    } catch (err) {
      logError(err, { action: 'loadSettings' });
      setError('load_failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!user || !isInstructor) return;

    // Validate required fields
    if (formData.payout_method === 'wompi') {
      if (
        !formData.payout_bank_name ||
        !formData.payout_account_number ||
        !formData.payout_document_type ||
        !formData.payout_document_number
      ) {
        showError(tr.formIncomplete);
        return;
      }
    }

    try {
      setSaving(true);

      const { error: updateError } = await supabase
        .from('users')
        .update({
          payout_method: formData.payout_method,
          payout_bank_name: formData.payout_bank_name || null,
          payout_account_type: formData.payout_account_type || null,
          payout_account_number: formData.payout_account_number || null,
          payout_document_type: formData.payout_document_type || null,
          payout_document_number: formData.payout_document_number || null,
        })
        .eq('id', user.id);

      if (updateError) {
        logError(updateError, { action: 'handleSave' });
        showError(tr.errorSaving);
        return;
      }

      showSuccess(tr.settingsSaved);
      router.push('/earnings');
    } catch (err) {
      logError(err, { action: 'handleSave' });
      showError(tr.errorSaving);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-theme-page flex items-center justify-center">
        <p className="text-theme-primary">{tr.loading}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-theme-page flex flex-col items-center justify-center p-4">
        <p className="text-theme-primary text-lg mb-4">{tr.error}</p>
        <Button onClick={() => window.location.reload()} className="px-6 py-3 font-bold">
          {tr.tryAgain}
        </Button>
      </div>
    );
  }

  if (!isInstructor) {
    return (
      <div className="min-h-screen bg-theme-page flex flex-col items-center justify-center p-4">
        <Shield className="w-16 h-16 text-tribe-green mb-4" />
        <p className="text-theme-primary text-lg text-center mb-6">{tr.instructorOnly}</p>
        <Link href="/profile/edit">
          <Button className="px-6 py-3 font-bold">{language === 'es' ? 'Ir a Perfil' : 'Go to Profile'}</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-theme-page pb-32">
      {/* Header */}
      <div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-theme-card border-b border-theme">
        <div className="max-w-2xl mx-auto h-14 flex items-center justify-between px-4">
          <div className="flex items-center">
            <Link href="/earnings">
              <Button variant="ghost" size="icon" className="mr-3">
                <ArrowLeft className="w-6 h-6 text-theme-primary" />
              </Button>
            </Link>
            <h1 className="text-xl font-bold text-theme-primary">{tr.pageTitle}</h1>
          </div>
          <Button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-4 py-2 font-semibold">
            <Save className="w-4 h-4" />
            {saving ? tr.savingChanges : tr.save}
          </Button>
        </div>
      </div>

      <div className="pt-header max-w-2xl mx-auto p-4 space-y-6">
        {/* Payout Method Selection */}
        <Card className="bg-white dark:bg-tribe-surface border border-stone-200 dark:border-gray-600">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-theme-primary">
              <CreditCard className="w-5 h-5 text-tribe-green" />
              {tr.payoutMethod}
            </CardTitle>
            <CardDescription className="text-stone-600 dark:text-gray-400">{tr.payoutMethodDesc}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              {/* Wompi Method */}
              <label className="flex items-start gap-3 p-3 border border-stone-300 dark:border-gray-600 rounded-lg cursor-pointer hover:bg-stone-50 dark:hover:bg-tribe-surface transition">
                <input
                  type="radio"
                  name="payout_method"
                  value="wompi"
                  checked={formData.payout_method === 'wompi'}
                  onChange={(e) => setFormData({ ...formData, payout_method: e.target.value as 'wompi' | 'manual' })}
                  className="mt-1 w-4 h-4 cursor-pointer accent-tribe-green"
                />
                <div className="flex-1">
                  <p className="font-semibold text-theme-primary">{tr.methodWompi}</p>
                  <p className="text-sm text-stone-600 dark:text-gray-400 mt-1">
                    {language === 'es'
                      ? 'Recibe pagos directamente a tu cuenta bancaria'
                      : 'Receive payments directly to your bank account'}
                  </p>
                </div>
              </label>

              {/* Manual Method */}
              <label className="flex items-start gap-3 p-3 border border-stone-300 dark:border-gray-600 rounded-lg cursor-pointer hover:bg-stone-50 dark:hover:bg-tribe-surface transition">
                <input
                  type="radio"
                  name="payout_method"
                  value="manual"
                  checked={formData.payout_method === 'manual'}
                  onChange={(e) => setFormData({ ...formData, payout_method: e.target.value as 'wompi' | 'manual' })}
                  className="mt-1 w-4 h-4 cursor-pointer accent-tribe-green"
                />
                <div className="flex-1">
                  <p className="font-semibold text-theme-primary">{tr.methodManual}</p>
                  <p className="text-sm text-stone-600 dark:text-gray-400 mt-1">{tr.manualNote}</p>
                </div>
              </label>
            </div>
          </CardContent>
        </Card>

        {/* Bank Details - Show only when Wompi is selected */}
        {formData.payout_method === 'wompi' && (
          <Card className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-theme-primary">
                <Building2 className="w-5 h-5 text-tribe-green" />
                {tr.bankDetails}
              </CardTitle>
              <CardDescription className="text-stone-600 dark:text-gray-400">{tr.bankDetailsDesc}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Bank Name */}
              <div>
                <Label className="font-semibold text-theme-primary mb-2 block">{tr.bankName}</Label>
                <Select
                  value={formData.payout_bank_name}
                  onValueChange={(value) => setFormData({ ...formData, payout_bank_name: value })}
                >
                  <SelectTrigger className="dark:bg-tribe-mid dark:border-gray-600 dark:text-white focus-visible:ring-tribe-green">
                    <SelectValue placeholder={tr.selectBank} />
                  </SelectTrigger>
                  <SelectContent>
                    {BANK_OPTIONS.map((bank) => (
                      <SelectItem key={bank.value} value={bank.value}>
                        {bank.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Account Type */}
              <div>
                <Label className="font-semibold text-theme-primary mb-2 block">{tr.accountType}</Label>
                <div className="flex gap-3">
                  <label className="flex items-center gap-2 flex-1 p-3 border border-stone-300 dark:border-gray-600 rounded-lg cursor-pointer hover:bg-stone-50 dark:hover:bg-tribe-surface transition">
                    <input
                      type="radio"
                      name="account_type"
                      value="savings"
                      checked={formData.payout_account_type === 'savings'}
                      onChange={(e) =>
                        setFormData({ ...formData, payout_account_type: e.target.value as 'savings' | 'checking' })
                      }
                      className="w-4 h-4 cursor-pointer accent-tribe-green"
                    />
                    <span className="text-theme-primary">{tr.savings}</span>
                  </label>
                  <label className="flex items-center gap-2 flex-1 p-3 border border-stone-300 dark:border-gray-600 rounded-lg cursor-pointer hover:bg-stone-50 dark:hover:bg-tribe-surface transition">
                    <input
                      type="radio"
                      name="account_type"
                      value="checking"
                      checked={formData.payout_account_type === 'checking'}
                      onChange={(e) =>
                        setFormData({ ...formData, payout_account_type: e.target.value as 'savings' | 'checking' })
                      }
                      className="w-4 h-4 cursor-pointer accent-tribe-green"
                    />
                    <span className="text-theme-primary">{tr.checking}</span>
                  </label>
                </div>
              </div>

              {/* Account Number */}
              <div>
                <Label className="font-semibold text-theme-primary mb-2 block">{tr.accountNumber}</Label>
                <Input
                  type="text"
                  value={formData.payout_account_number}
                  onChange={(e) => setFormData({ ...formData, payout_account_number: e.target.value })}
                  placeholder={tr.accountNumberPlaceholder}
                  className="h-auto py-3 dark:bg-tribe-mid dark:border-gray-600 dark:text-white placeholder-gray-500 focus-visible:ring-tribe-green"
                />
                <p className="text-xs text-stone-500 dark:text-gray-400 mt-2">{tr.maskedWarning}</p>
              </div>

              {/* Document Type */}
              <div>
                <Label className="font-semibold text-theme-primary mb-2 block">{tr.documentType}</Label>
                <Select
                  value={formData.payout_document_type}
                  onValueChange={(value) => setFormData({ ...formData, payout_document_type: value as any })}
                >
                  <SelectTrigger className="dark:bg-tribe-mid dark:border-gray-600 dark:text-white focus-visible:ring-tribe-green">
                    <SelectValue placeholder={tr.selectDocType} />
                  </SelectTrigger>
                  <SelectContent>
                    {DOCUMENT_TYPES.map((doc) => (
                      <SelectItem key={doc.value} value={doc.value}>
                        {doc.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Document Number */}
              <div>
                <Label className="font-semibold text-theme-primary mb-2 block">{tr.documentNumber}</Label>
                <Input
                  type="text"
                  value={formData.payout_document_number}
                  onChange={(e) => setFormData({ ...formData, payout_document_number: e.target.value })}
                  placeholder={tr.documentNumberPlaceholder}
                  className="h-auto py-3 dark:bg-tribe-mid dark:border-gray-600 dark:text-white placeholder-gray-500 focus-visible:ring-tribe-green"
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Security Info */}
        <Card className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-theme-primary">
              <Shield className="w-5 h-5 text-tribe-green" />
              {tr.security}
            </CardTitle>
            <CardDescription className="text-stone-600 dark:text-gray-400">{tr.securityDesc}</CardDescription>
          </CardHeader>
        </Card>

        {/* Save Button */}
        <Button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-4 font-bold rounded-2xl text-lg bg-tribe-green hover:bg-tribe-green text-slate-900"
        >
          {saving ? tr.savingChanges : tr.save}
        </Button>
      </div>

      <BottomNav />
    </div>
  );
}
