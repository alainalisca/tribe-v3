'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/LanguageContext';
import {
  Plus,
  Copy,
  Trash2,
  Edit2,
  CheckCircle,
  AlertCircle,
  Clock,
  Zap,
  ChevronDown,
  Calendar,
  DollarSign,
  ArrowLeft,
} from 'lucide-react';
import BottomNav from '@/components/BottomNav';

interface PromoCode {
  id: string;
  code: string;
  discount_type: 'percentage' | 'fixed' | 'free_session';
  discount_value: number;
  currency: 'COP' | 'USD';
  max_uses: number | null;
  current_uses: number;
  applies_to: 'all' | 'specific_session' | 'specific_package';
  session_id: string | null;
  package_id: string | null;
  start_date: string;
  expiry_date: string | null;
  min_amount_cents: number | null;
  is_active: boolean;
  created_at: string;
  instructor_id: string;
}

interface Session {
  id: string;
  sport: string;
  date: string;
}

interface Package {
  id: string;
  name: string;
}

interface Stats {
  total_codes: number;
  active_codes: number;
  total_redemptions: number;
  revenue_generated: number;
}

const translations = {
  en: {
    title: 'Promo Codes',
    activeCount: 'active codes',
    createButton: 'Create Code',
    code: 'Code',
    discountType: 'Discount Type',
    percentage: 'Percentage',
    fixed: 'Fixed Amount',
    freeSession: 'Free Session',
    discountValue: 'Discount Value',
    currency: 'Currency',
    maxUses: 'Max Uses',
    unlimited: 'Unlimited',
    appliesTo: 'Applies To',
    allSessions: 'All Sessions',
    specificSession: 'Specific Session',
    specificPackage: 'Specific Package',
    selectSession: 'Select a session',
    selectPackage: 'Select a package',
    startDate: 'Start Date',
    expiryDate: 'Expiry Date',
    noExpiry: 'No expiry',
    minAmount: 'Minimum Order Amount (optional)',
    createCode: 'Create Code',
    active: 'Active',
    expired: 'Expired',
    maxedOut: 'Maxed Out',
    usage: 'Usage',
    used: 'used',
    expiresOn: 'Expires on',
    appliedTo: 'Applied to',
    actions: 'Actions',
    copy: 'Copy',
    deactivate: 'Deactivate',
    reactivate: 'Reactivate',
    edit: 'Edit',
    delete: 'Delete',
    statsTitle: 'Overview',
    totalCodes: 'Total Codes',
    activeCodes: 'Active Codes',
    totalRedemptions: 'Total Redemptions',
    revenueGenerated: 'Revenue Generated',
    emptyState: 'No promo codes yet',
    emptyDescription: 'Create your first promo code to start offering discounts',
    errorAuth: 'You must be logged in as an instructor to manage promo codes',
    errorFetch: 'Failed to load promo codes',
    successCreate: 'Promo code created successfully',
    successUpdate: 'Promo code updated successfully',
    errorCreate: 'Failed to create promo code',
    invalidCode: 'Code must be alphanumeric and up to 20 characters',
    sessionNotFound: 'Session not found',
    packageNotFound: 'Package not found',
    copySuccess: 'Code copied to clipboard',
    percentOff: '% off',
    off: 'off',
    formPanel: 'New Promo Code',
    toggleForm: 'Toggle form',
  },
  es: {
    title: 'Códigos Promocionales',
    activeCount: 'códigos activos',
    createButton: 'Crear Código',
    code: 'Código',
    discountType: 'Tipo de Descuento',
    percentage: 'Porcentaje',
    fixed: 'Cantidad Fija',
    freeSession: 'Sesión Gratis',
    discountValue: 'Valor del Descuento',
    currency: 'Moneda',
    maxUses: 'Máximo de Usos',
    unlimited: 'Ilimitado',
    appliesTo: 'Se Aplica A',
    allSessions: 'Todas las Sesiones',
    specificSession: 'Sesión Específica',
    specificPackage: 'Paquete Específico',
    selectSession: 'Seleccionar una sesión',
    selectPackage: 'Seleccionar un paquete',
    startDate: 'Fecha de Inicio',
    expiryDate: 'Fecha de Vencimiento',
    noExpiry: 'Sin vencimiento',
    minAmount: 'Monto Mínimo de Pedido (opcional)',
    createCode: 'Crear Código',
    active: 'Activo',
    expired: 'Vencido',
    maxedOut: 'Agotado',
    usage: 'Uso',
    used: 'usado',
    expiresOn: 'Vence el',
    appliedTo: 'Se aplica a',
    actions: 'Acciones',
    copy: 'Copiar',
    deactivate: 'Desactivar',
    reactivate: 'Reactivar',
    edit: 'Editar',
    delete: 'Eliminar',
    statsTitle: 'Resumen',
    totalCodes: 'Códigos Totales',
    activeCodes: 'Códigos Activos',
    totalRedemptions: 'Canjes Totales',
    revenueGenerated: 'Ingresos Generados',
    emptyState: 'Sin códigos promocionales',
    emptyDescription: 'Crea tu primer código promocional para comenzar a ofrecer descuentos',
    errorAuth: 'Debe estar conectado como instructor para administrar códigos promocionales',
    errorFetch: 'No se pudieron cargar los códigos promocionales',
    successCreate: 'Código promocional creado exitosamente',
    successUpdate: 'Código promocional actualizado exitosamente',
    errorCreate: 'No se pudo crear el código promocional',
    invalidCode: 'El código debe ser alfanumérico y tener máximo 20 caracteres',
    sessionNotFound: 'Sesión no encontrada',
    packageNotFound: 'Paquete no encontrado',
    copySuccess: 'Código copiado al portapapeles',
    percentOff: '% de descuento',
    off: 'de descuento',
    formPanel: 'Nuevo Código Promocional',
    toggleForm: 'Alternar formulario',
  },
};

export default function PromoCodesPage() {
  const { language } = useLanguage();
  const t = translations[language as keyof typeof translations] || translations.en;
  const supabase = createClient();

  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [stats, setStats] = useState<Stats>({
    total_codes: 0,
    active_codes: 0,
    total_redemptions: 0,
    revenue_generated: 0,
  });
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    code: '',
    discountType: 'percentage' as 'percentage' | 'fixed' | 'free_session',
    discountValue: '',
    currency: 'COP' as 'COP' | 'USD',
    maxUses: '',
    unlimitedUses: true,
    appliesTo: 'all' as 'all' | 'specific_session' | 'specific_package',
    sessionId: '',
    packageId: '',
    startDate: new Date().toISOString().split('T')[0],
    expiryDate: '',
    noExpiry: true,
    minAmount: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (!authUser) {
        setError(t.errorAuth);
        setLoading(false);
        return;
      }

      const { data: profileData, error: profileError } = await supabase
        .from('user_profiles')
        .select('is_instructor')
        .eq('user_id', authUser.id)
        .single();

      if (profileError || !profileData?.is_instructor) {
        setError(t.errorAuth);
        setLoading(false);
        return;
      }

      setUser(authUser);
      fetchPromoCodes(authUser.id);
      fetchSessions(authUser.id);
      fetchPackages(authUser.id);
    } catch (err) {
      setError(t.errorAuth);
      setLoading(false);
    }
  };

  const fetchPromoCodes = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('promo_codes')
        .select('*')
        .eq('instructor_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setPromoCodes(data || []);
      calculateStats(data || [], userId);
      setLoading(false);
    } catch (err) {
      setError(t.errorFetch);
      setLoading(false);
    }
  };

  const fetchSessions = async (userId: string) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('sessions')
        .select('id, sport, date')
        .eq('creator_id', userId)
        .gte('date', today)
        .order('date', { ascending: true });

      if (error) throw error;
      setSessions(data || []);
    } catch (err) {
      console.error('Failed to fetch sessions:', err);
    }
  };

  const fetchPackages = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('service_packages')
        .select('id, name')
        .eq('instructor_id', userId)
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (error) throw error;
      setPackages(data || []);
    } catch (err) {
      console.error('Failed to fetch packages:', err);
    }
  };

  const calculateStats = async (codes: PromoCode[], userId: string) => {
    try {
      const codeIds = codes.map((c) => c.id);
      if (codeIds.length === 0) {
        setStats({
          total_codes: 0,
          active_codes: 0,
          total_redemptions: 0,
          revenue_generated: 0,
        });
        return;
      }

      const { data: redemptions, error } = await supabase
        .from('promo_redemptions')
        .select('discount_amount_cents, promo_code_id')
        .in('promo_code_id', codeIds);

      if (error) throw error;

      const activeCodes = codes.filter((c) => {
        const isExpired = c.expiry_date && new Date(c.expiry_date) < new Date();
        return c.is_active && !isExpired;
      }).length;

      const totalRedemptions = redemptions?.length || 0;
      const revenueGenerated = (redemptions || []).reduce(
        (sum: number, r: { discount_amount_cents?: number }) => sum + (r.discount_amount_cents || 0),
        0
      );

      setStats({
        total_codes: codes.length,
        active_codes: activeCodes,
        total_redemptions: totalRedemptions,
        revenue_generated: revenueGenerated,
      });
    } catch (err) {
      console.error('Failed to calculate stats:', err);
    }
  };

  const validateCode = (code: string): boolean => {
    const alphanumericRegex = /^[A-Z0-9]*$/;
    return code.length > 0 && code.length <= 20 && alphanumericRegex.test(code);
  };

  const handleCreateCode = async () => {
    setError(null);
    setSuccess(null);

    if (!validateCode(formData.code)) {
      setError(t.invalidCode);
      return;
    }

    if (!formData.discountValue) {
      setError('Please enter a discount value');
      return;
    }

    if (formData.appliesTo === 'specific_session' && !formData.sessionId) {
      setError(t.selectSession);
      return;
    }

    if (formData.appliesTo === 'specific_package' && !formData.packageId) {
      setError(t.selectPackage);
      return;
    }

    setSubmitting(true);

    try {
      const newPromoCode = {
        instructor_id: user.id,
        code: formData.code.toUpperCase(),
        discount_type: formData.discountType,
        discount_value: parseInt(formData.discountValue),
        currency: formData.currency,
        max_uses: formData.unlimitedUses ? null : parseInt(formData.maxUses) || null,
        applies_to: formData.appliesTo,
        session_id: formData.appliesTo === 'specific_session' ? formData.sessionId : null,
        package_id: formData.appliesTo === 'specific_package' ? formData.packageId : null,
        start_date: formData.startDate,
        expiry_date: formData.noExpiry ? null : formData.expiryDate,
        min_amount_cents: formData.minAmount ? parseInt(formData.minAmount) * 100 : null,
        is_active: true,
      };

      const { data, error } = await supabase
        .from('promo_codes')
        .insert([newPromoCode])
        .select();

      if (error) throw error;

      setSuccess(t.successCreate);
      setFormData({
        code: '',
        discountType: 'percentage',
        discountValue: '',
        currency: 'COP',
        maxUses: '',
        unlimitedUses: true,
        appliesTo: 'all',
        sessionId: '',
        packageId: '',
        startDate: new Date().toISOString().split('T')[0],
        expiryDate: '',
        noExpiry: true,
        minAmount: '',
      });
      setShowForm(false);
      fetchPromoCodes(user.id);
    } catch (err) {
      setError(t.errorCreate);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeactivate = async (promoId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('promo_codes')
        .update({ is_active: !currentStatus })
        .eq('id', promoId);

      if (error) throw error;

      setSuccess(t.successUpdate);
      fetchPromoCodes(user.id);
    } catch (err) {
      setError('Failed to update promo code');
    }
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setSuccess(t.copySuccess);
    setTimeout(() => setSuccess(null), 2000);
  };

  const getPromoStatus = (promo: PromoCode) => {
    if (!promo.is_active) return { status: 'inactive', label: 'Inactive', color: 'bg-stone-200 dark:bg-gray-700 text-stone-500' };
    if (promo.expiry_date && new Date(promo.expiry_date) < new Date()) {
      return { status: 'expired', label: t.expired, color: 'bg-stone-200 dark:bg-gray-700 text-stone-500' };
    }
    if (promo.max_uses !== null && promo.current_uses >= promo.max_uses) {
      return { status: 'maxed_out', label: t.maxedOut, color: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' };
    }
    return { status: 'active', label: t.active, color: 'bg-tribe-green/20 text-tribe-green' };
  };

  const getDiscountDescription = (promo: PromoCode): string => {
    if (promo.discount_type === 'percentage') {
      return `${promo.discount_value}${t.percentOff}`;
    } else if (promo.discount_type === 'fixed') {
      const amount = promo.discount_value / 100;
      return `${promo.currency} ${amount.toFixed(2)} ${t.off}`;
    } else {
      return 'Free session';
    }
  };

  const getAppliesTo = (promo: PromoCode): string => {
    if (promo.applies_to === 'all') return t.allSessions;
    if (promo.applies_to === 'specific_session') {
      const session = sessions.find((s) => s.id === promo.session_id);
      return session ? `${session.sport} - ${new Date(session.date).toLocaleDateString(language === 'es' ? 'es-ES' : 'en-US')}` : t.sessionNotFound;
    }
    if (promo.applies_to === 'specific_package') {
      const pkg = packages.find((p) => p.id === promo.package_id);
      return pkg ? pkg.name : t.packageNotFound;
    }
    return '';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-theme-page p-4 flex items-center justify-center">
        <p className="text-lg text-theme-secondary">Loading...</p>
      </div>
    );
  }

  if (error && !promoCodes.length) {
    return (
      <div className="min-h-screen bg-theme-page p-4 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 mx-auto mb-4 text-red-500" />
          <p className="text-lg text-theme-secondary">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-theme-page pb-32">
      {/* Fixed Header */}
      <div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-theme-card border-b border-theme">
        <div className="max-w-2xl mx-auto h-14 flex items-center px-4">
          <Link href="/promote" className="flex items-center gap-2 text-tribe-green hover:text-tribe-green/80 transition">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex-1 ml-3">
            <h1 className="text-lg font-bold text-theme-primary">{t.title}</h1>
            <p className="text-xs text-theme-secondary">
              {stats.active_codes} {t.activeCount}
            </p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="pt-header max-w-2xl mx-auto p-4 space-y-4">
        {/* Error / Success Messages */}
        {error && (
          <div className="bg-red-100 dark:bg-red-900/30 border border-red-600 dark:border-red-400 text-red-600 dark:text-red-400 p-4 rounded-lg">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-tribe-green/20 border border-tribe-green text-tribe-green p-4 rounded-lg">
            {success}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="border-tribe-green/30 bg-gradient-to-br from-tribe-green/10 to-lime-50 dark:from-tribe-green/5 dark:to-green-900/20 rounded-2xl p-4 border">
            <p className="text-theme-secondary text-xs mb-2">{t.totalCodes}</p>
            <p className="text-2xl font-bold text-tribe-green">{stats.total_codes}</p>
          </div>
          <div className="border-tribe-green/30 bg-gradient-to-br from-tribe-green/10 to-lime-50 dark:from-tribe-green/5 dark:to-green-900/20 rounded-2xl p-4 border">
            <p className="text-theme-secondary text-xs mb-2">{t.activeCodes}</p>
            <p className="text-2xl font-bold text-tribe-green">{stats.active_codes}</p>
          </div>
          <div className="border-tribe-green/30 bg-gradient-to-br from-tribe-green/10 to-lime-50 dark:from-tribe-green/5 dark:to-green-900/20 rounded-2xl p-4 border">
            <p className="text-theme-secondary text-xs mb-2">{t.totalRedemptions}</p>
            <p className="text-2xl font-bold text-tribe-green">{stats.total_redemptions}</p>
          </div>
          <div className="border-tribe-green/30 bg-gradient-to-br from-tribe-green/10 to-lime-50 dark:from-tribe-green/5 dark:to-green-900/20 rounded-2xl p-4 border">
            <p className="text-theme-secondary text-xs mb-2">{t.revenueGenerated}</p>
            <p className="text-xl font-bold text-tribe-green">
              ${(stats.revenue_generated / 100).toFixed(2)}
            </p>
          </div>
        </div>

        {/* Create Button */}
        <button
          onClick={() => setShowForm(!showForm)}
          className="w-full bg-tribe-green text-slate-900 hover:bg-[#8FD642] font-semibold rounded-xl py-3 flex items-center justify-center gap-2 transition"
        >
          <Plus className="w-5 h-5" />
          {t.createButton}
        </button>

        {/* Create Form */}
        {showForm && (
          <div className="bg-white dark:bg-[#272D34] rounded-2xl p-5 border border-stone-200 dark:border-gray-700">
            <h2 className="text-lg font-bold text-theme-primary mb-4">{t.formPanel}</h2>
            <div className="space-y-4">
              {/* Code Input */}
              <div>
                <label className="block text-sm font-medium text-theme-primary mb-2">
                  {t.code}
                </label>
                <input
                  type="text"
                  maxLength={20}
                  value={formData.code}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''),
                    })
                  }
                  placeholder="SUMMER2024"
                  className="w-full bg-white dark:bg-[#3D4349] border border-stone-200 dark:border-[#52575D] rounded-lg px-4 py-3 text-theme-primary placeholder-theme-secondary focus:outline-none focus:border-tribe-green"
                />
              </div>

              {/* Discount Type */}
              <div>
                <label className="block text-sm font-medium text-theme-primary mb-2">
                  {t.discountType}
                </label>
                <select
                  value={formData.discountType}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      discountType: e.target.value as 'percentage' | 'fixed' | 'free_session',
                    })
                  }
                  className="w-full bg-white dark:bg-[#3D4349] border border-stone-200 dark:border-[#52575D] rounded-lg px-4 py-3 text-theme-primary focus:outline-none focus:border-tribe-green"
                >
                  <option value="percentage">{t.percentage}</option>
                  <option value="fixed">{t.fixed}</option>
                  <option value="free_session">{t.freeSession}</option>
                </select>
              </div>

              {/* Discount Value */}
              {formData.discountType !== 'free_session' && (
                <div>
                  <label className="block text-sm font-medium text-theme-primary mb-2">
                    {t.discountValue}
                  </label>
                  <input
                    type="number"
                    value={formData.discountValue}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        discountValue: e.target.value,
                      })
                    }
                    min={formData.discountType === 'percentage' ? '1' : '0'}
                    max={formData.discountType === 'percentage' ? '100' : undefined}
                    placeholder={formData.discountType === 'percentage' ? '25' : '10000'}
                    className="w-full bg-white dark:bg-[#3D4349] border border-stone-200 dark:border-[#52575D] rounded-lg px-4 py-3 text-theme-primary placeholder-theme-secondary focus:outline-none focus:border-tribe-green"
                  />
                </div>
              )}

              {/* Currency (only for fixed) */}
              {formData.discountType === 'fixed' && (
                <div>
                  <label className="block text-sm font-medium text-theme-primary mb-2">
                    {t.currency}
                  </label>
                  <select
                    value={formData.currency}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        currency: e.target.value as 'COP' | 'USD',
                      })
                    }
                    className="w-full bg-white dark:bg-[#3D4349] border border-stone-200 dark:border-[#52575D] rounded-lg px-4 py-3 text-theme-primary focus:outline-none focus:border-tribe-green"
                  >
                    <option value="COP">COP</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
              )}

              {/* Max Uses */}
              <div>
                <label className="block text-sm font-medium text-theme-primary mb-2">
                  {t.maxUses}
                </label>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 text-theme-secondary">
                    <input
                      type="checkbox"
                      checked={formData.unlimitedUses}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          unlimitedUses: e.target.checked,
                          maxUses: e.target.checked ? '' : formData.maxUses,
                        })
                      }
                      className="w-4 h-4 rounded cursor-pointer"
                    />
                    {t.unlimited}
                  </label>
                </div>
                {!formData.unlimitedUses && (
                  <input
                    type="number"
                    value={formData.maxUses}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        maxUses: e.target.value,
                      })
                    }
                    min="1"
                    placeholder="50"
                    className="w-full mt-2 bg-white dark:bg-[#3D4349] border border-stone-200 dark:border-[#52575D] rounded-lg px-4 py-3 text-theme-primary placeholder-theme-secondary focus:outline-none focus:border-tribe-green"
                  />
                )}
              </div>

              {/* Applies To */}
              <div>
                <label className="block text-sm font-medium text-theme-primary mb-2">
                  {t.appliesTo}
                </label>
                <select
                  value={formData.appliesTo}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      appliesTo: e.target.value as 'all' | 'specific_session' | 'specific_package',
                      sessionId: '',
                      packageId: '',
                    })
                  }
                  className="w-full bg-white dark:bg-[#3D4349] border border-stone-200 dark:border-[#52575D] rounded-lg px-4 py-3 text-theme-primary focus:outline-none focus:border-tribe-green"
                >
                  <option value="all">{t.allSessions}</option>
                  <option value="specific_session">{t.specificSession}</option>
                  <option value="specific_package">{t.specificPackage}</option>
                </select>
              </div>

              {/* Specific Session Dropdown */}
              {formData.appliesTo === 'specific_session' && (
                <div>
                  <label className="block text-sm font-medium text-theme-primary mb-2">
                    {t.selectSession}
                  </label>
                  <select
                    value={formData.sessionId}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        sessionId: e.target.value,
                      })
                    }
                    className="w-full bg-white dark:bg-[#3D4349] border border-stone-200 dark:border-[#52575D] rounded-lg px-4 py-3 text-theme-primary focus:outline-none focus:border-tribe-green"
                  >
                    <option value="">{t.selectSession}</option>
                    {sessions.map((session) => (
                      <option key={session.id} value={session.id}>
                        {session.sport} -{' '}
                        {new Date(session.date).toLocaleDateString(language === 'es' ? 'es-ES' : 'en-US')}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Specific Package Dropdown */}
              {formData.appliesTo === 'specific_package' && (
                <div>
                  <label className="block text-sm font-medium text-theme-primary mb-2">
                    {t.selectPackage}
                  </label>
                  <select
                    value={formData.packageId}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        packageId: e.target.value,
                      })
                    }
                    className="w-full bg-white dark:bg-[#3D4349] border border-stone-200 dark:border-[#52575D] rounded-lg px-4 py-3 text-theme-primary focus:outline-none focus:border-tribe-green"
                  >
                    <option value="">{t.selectPackage}</option>
                    {packages.map((pkg) => (
                      <option key={pkg.id} value={pkg.id}>
                        {pkg.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Start Date */}
              <div>
                <label className="block text-sm font-medium text-theme-primary mb-2">
                  {t.startDate}
                </label>
                <input
                  type="date"
                  value={formData.startDate}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      startDate: e.target.value,
                    })
                  }
                  className="w-full bg-white dark:bg-[#3D4349] border border-stone-200 dark:border-[#52575D] rounded-lg px-4 py-3 text-theme-primary focus:outline-none focus:border-tribe-green"
                />
              </div>

              {/* Expiry Date */}
              <div>
                <label className="block text-sm font-medium text-theme-primary mb-2">
                  {t.expiryDate}
                </label>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 text-theme-secondary">
                    <input
                      type="checkbox"
                      checked={formData.noExpiry}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          noExpiry: e.target.checked,
                          expiryDate: e.target.checked ? '' : formData.expiryDate,
                        })
                      }
                      className="w-4 h-4 rounded cursor-pointer"
                    />
                    {t.noExpiry}
                  </label>
                </div>
                {!formData.noExpiry && (
                  <input
                    type="date"
                    value={formData.expiryDate}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        expiryDate: e.target.value,
                      })
                    }
                    className="w-full mt-2 bg-white dark:bg-[#3D4349] border border-stone-200 dark:border-[#52575D] rounded-lg px-4 py-3 text-theme-primary focus:outline-none focus:border-tribe-green"
                  />
                )}
              </div>

              {/* Min Amount */}
              <div>
                <label className="block text-sm font-medium text-theme-primary mb-2">
                  {t.minAmount}
                </label>
                <input
                  type="number"
                  value={formData.minAmount}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      minAmount: e.target.value,
                    })
                  }
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                  className="w-full bg-white dark:bg-[#3D4349] border border-stone-200 dark:border-[#52575D] rounded-lg px-4 py-3 text-theme-primary placeholder-theme-secondary focus:outline-none focus:border-tribe-green"
                />
              </div>

              {/* Submit Button */}
              <div className="flex gap-3 mt-6">
                <button
                  onClick={handleCreateCode}
                  disabled={submitting}
                  className="flex-1 bg-tribe-green text-slate-900 hover:bg-[#8FD642] disabled:bg-tribe-green/50 font-semibold rounded-xl py-3 transition"
                >
                  {submitting ? 'Creating...' : t.createCode}
                </button>
                <button
                  onClick={() => setShowForm(false)}
                  className="flex-1 bg-stone-100 dark:bg-[#3D4349] text-stone-700 dark:text-gray-300 rounded-xl py-3 font-semibold transition"
                >
                  {language === 'es' ? 'Cancelar' : 'Cancel'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Promo Codes List */}
        {promoCodes.length === 0 ? (
          <div className="bg-white dark:bg-[#272D34] rounded-2xl p-12 border border-stone-200 dark:border-gray-700 text-center">
            <Zap className="w-12 h-12 mx-auto mb-4 text-stone-400" />
            <h3 className="text-lg font-bold text-theme-primary mb-2">{t.emptyState}</h3>
            <p className="text-theme-secondary">{t.emptyDescription}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {promoCodes.map((promo) => {
              const statusInfo = getPromoStatus(promo);
              return (
                <div
                  key={promo.id}
                  className="bg-white dark:bg-[#272D34] rounded-2xl p-5 border border-stone-200 dark:border-gray-700"
                >
                  {/* Code and Badge */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <code className="bg-stone-100 dark:bg-[#3D4349] px-3 py-1 rounded font-mono text-tribe-green text-sm font-bold">
                        {promo.code}
                      </code>
                      <button
                        onClick={() => handleCopyCode(promo.code)}
                        className="text-tribe-green hover:text-tribe-green/80 transition"
                        title={t.copy}
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                    <span className={`${statusInfo.color} text-xs px-3 py-1 rounded-full font-semibold`}>
                      {statusInfo.label}
                    </span>
                  </div>

                  {/* Discount Description */}
                  <p className="text-lg font-bold text-tribe-green mb-3">
                    {getDiscountDescription(promo)}
                  </p>

                  {/* Usage Stats */}
                  <div className="bg-stone-50 dark:bg-[#3D4349] rounded px-3 py-2 mb-3 text-sm">
                    <p className="text-theme-primary">
                      {t.usage}:{' '}
                      <span className="font-semibold">
                        {promo.max_uses === null ? `∞` : `${promo.max_uses} ${t.used}`}
                      </span>
                    </p>
                  </div>

                  {/* Expiry Date */}
                  {promo.expiry_date ? (
                    <p className="text-theme-secondary text-sm mb-2">
                      {t.expiresOn}:{' '}
                      {new Date(promo.expiry_date).toLocaleDateString(
                        language === 'es' ? 'es-ES' : 'en-US'
                      )}
                    </p>
                  ) : (
                    <p className="text-theme-secondary text-sm mb-2">No expiry date</p>
                  )}

                  {/* Applies To */}
                  <p className="text-theme-secondary text-sm mb-3">
                    {t.appliedTo}: {getAppliesTo(promo)}
                  </p>

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-3 border-t border-stone-200 dark:border-gray-700">
                    <button
                      onClick={() => handleDeactivate(promo.id, promo.is_active)}
                      className={`flex-1 py-2 px-3 rounded-lg font-medium text-sm transition ${
                        promo.is_active
                          ? 'bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400'
                          : 'bg-tribe-green/20 hover:bg-tribe-green/30 text-tribe-green'
                      }`}
                    >
                      {promo.is_active ? t.deactivate : t.reactivate}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
