'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useLanguage } from '@/lib/LanguageContext'
import { getTrialStatus, isFeatureFree } from '@/lib/trial'
import TrialBanner from '@/components/TrialBanner'
import {
  Plus,
  Zap,
  Eye,
  MousePointerClick,
  TrendingUp,
  DollarSign,
  Pause,
  X,
  Calendar,
  Radio,
  MessageSquare,
  User,
  ChevronDown,
  CheckCircle2,
  Clock,
  ArrowLeft,
  CreditCard,
  Gift,
} from 'lucide-react'
import BottomNav from '@/components/BottomNav'

const BOOST_TIERS = {
  starter: { cop: 500000, usd: 200, label: 'Starter' },
  growth: { cop: 1500000, usd: 500, label: 'Growth' },
  spotlight: { cop: 5000000, usd: 1500, label: 'Spotlight' }
}

const TIER_CONFIG = {
  starter: {
    dailyCopCents: 500000,
    dailyUsdCents: 200,
    impressions: 500,
    color: 'bg-blue-100',
    textColor: 'text-blue-700',
    borderColor: 'border-blue-500',
    badge: 'Starter'
  },
  growth: {
    dailyCopCents: 1500000,
    dailyUsdCents: 500,
    impressions: 2000,
    color: 'bg-tribe-green',
    textColor: 'text-slate-900',
    borderColor: 'border-tribe-green',
    badge: 'Growth',
    recommended: true
  },
  spotlight: {
    dailyCopCents: 5000000,
    dailyUsdCents: 1500,
    impressions: 8000,
    color: 'bg-amber-100',
    textColor: 'text-amber-700',
    borderColor: 'border-amber-500',
    badge: 'Spotlight'
  }
}

type BoostType = 'session' | 'post' | 'profile'
type BoostTier = 'starter' | 'growth' | 'spotlight'
type Currency = 'COP' | 'USD'

interface BoostCampaign {
  id: string
  instructor_id: string
  boost_type: BoostType
  tier: BoostTier
  session_id?: string
  post_id?: string
  status: 'active' | 'paused' | 'completed' | 'cancelled'
  total_budget_cents: number
  spent_cents: number
  starts_at: string
  ends_at: string
  impressions: number
  clicks: number
  created_at: string
  session?: { sport: string; date: string; start_time: string }
  post?: { content: string }
}

interface Session {
  id: string
  sport: string
  date: string
  start_time: string
}

interface Post {
  id: string
  content: string
}

export default function BoostsPage() {
  const supabase = createClient()
  const { language } = useLanguage()

  const [userId, setUserId] = useState<string | null>(null)
  const [isInstructor, setIsInstructor] = useState(false)
  const [instructorSince, setInstructorSince] = useState<string | null>(null)
  const [campaigns, setCampaigns] = useState<BoostCampaign[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [showNewBoostForm, setShowNewBoostForm] = useState(false)
  const [currency, setCurrency] = useState<Currency>('USD')
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [pendingBoostData, setPendingBoostData] = useState<Record<string, unknown> | null>(null)

  // Form state
  const [boostType, setBoostType] = useState<BoostType>('session')
  const [selectedSession, setSelectedSession] = useState<string>('')
  const [selectedPost, setSelectedPost] = useState<string>('')
  const [selectedTier, setSelectedTier] = useState<BoostTier>('growth')
  const [duration, setDuration] = useState(7)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Translations
  const t = {
    en: {
      boostCampaigns: 'Boost Campaigns',
      newBoost: '+ New Boost',
      activeCampaigns: 'Active Campaigns',
      noCampaigns: 'No active campaigns yet',
      pastCampaigns: 'Past Campaigns',
      totalImpressions: 'Total Impressions',
      totalClicks: 'Total Clicks',
      avgCTR: 'Avg. CTR',
      totalSpent: 'Total Spent',
      live: 'LIVE',
      budgetProgress: 'Budget Progress',
      daysRemaining: 'Days Remaining',
      metrics: 'Metrics',
      impressions: 'Impressions',
      clicks: 'Clicks',
      ctr: 'CTR',
      pause: 'Pause',
      cancel: 'Cancel',
      createNewBoost: 'Create New Boost',
      whatToBoost: "What's boosted?",
      session: 'Session',
      post: 'Post',
      profile: 'Profile',
      selectSession: 'Select a session',
      selectPost: 'Select a post',
      chooseATier: 'Choose a Tier',
      starterDesc: '~500 impressions',
      growthDesc: '~2,000 impressions',
      spotlightDesc: '~8,000 impressions',
      discoveryFeed: 'Discovery feed',
      feedHomepage: 'Feed + Homepage',
      feedHomeSearch: 'Feed + Home + Top of Search',
      recommended: 'RECOMMENDED',
      duration: 'Duration (days)',
      totalBudget: 'Total Budget',
      currencyLabel: 'Currency',
      launchBoost: 'Launch Boost',
      selectOption: 'Select an option',
      day: 'day',
      days: 'days',
      perDay: 'per day',
      completed: 'Completed',
      cancelled: 'Cancelled',
      paused: 'Paused',
      noUpcomingSessions: 'No upcoming sessions',
      noRecentPosts: 'No recent posts',
      errorAuth: 'You must be logged in as an instructor',
      errorFetch: 'Error loading campaigns',
      errorCreate: 'Error creating boost',
      successCreate: 'Boost campaign created successfully!',
      by: 'by',
      learn: 'Learn about boost campaigns'
    },
    es: {
      boostCampaigns: 'Campañas de Impulso',
      newBoost: '+ Nuevo Impulso',
      activeCampaigns: 'Campañas Activas',
      noCampaigns: 'Sin campañas activas aún',
      pastCampaigns: 'Campañas Anteriores',
      totalImpressions: 'Impresiones Totales',
      totalClicks: 'Clics Totales',
      avgCTR: 'CTR Prom.',
      totalSpent: 'Total Gastado',
      live: 'EN VIVO',
      budgetProgress: 'Progreso Presupuesto',
      daysRemaining: 'Días Restantes',
      metrics: 'Métricas',
      impressions: 'Impresiones',
      clicks: 'Clics',
      ctr: 'CTR',
      pause: 'Pausa',
      cancel: 'Cancelar',
      createNewBoost: 'Crear Nuevo Impulso',
      whatToBoost: '¿Qué impulsar?',
      session: 'Sesión',
      post: 'Publicación',
      profile: 'Perfil',
      selectSession: 'Selecciona una sesión',
      selectPost: 'Selecciona una publicación',
      chooseATier: 'Elige un Plan',
      starterDesc: '~500 impresiones',
      growthDesc: '~2.000 impresiones',
      spotlightDesc: '~8.000 impresiones',
      discoveryFeed: 'Feed de descubrimiento',
      feedHomepage: 'Feed + Inicio',
      feedHomeSearch: 'Feed + Inicio + Top Búsqueda',
      recommended: 'RECOMENDADO',
      duration: 'Duración (días)',
      totalBudget: 'Presupuesto Total',
      currencyLabel: 'Moneda',
      launchBoost: 'Lanzar Impulso',
      selectOption: 'Selecciona una opción',
      day: 'día',
      days: 'días',
      perDay: 'por día',
      completed: 'Completada',
      cancelled: 'Cancelada',
      paused: 'Pausada',
      noUpcomingSessions: 'Sin sesiones próximas',
      noRecentPosts: 'Sin publicaciones recientes',
      errorAuth: 'Debes iniciar sesión como instructor',
      errorFetch: 'Error al cargar campañas',
      errorCreate: 'Error al crear impulso',
      successCreate: '¡Campaña de impulso creada exitosamente!',
      by: 'por',
      learn: 'Aprende sobre campañas de impulso'
    }
  }

  const i18n = t[language as keyof typeof t]

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          alert(i18n.errorAuth)
          return
        }

        setUserId(user.id)

        // Check if user is instructor and get trial info
        const { data: profile } = await supabase
          .from('users')
          .select('is_instructor, instructor_since')
          .eq('id', user.id)
          .single()

        if (!profile?.is_instructor) {
          alert(i18n.errorAuth)
          return
        }

        setIsInstructor(true)
        setInstructorSince(profile.instructor_since || null)
        await fetchCampaigns(user.id)
        await fetchSessions(user.id)
        await fetchPosts(user.id)
      } catch (error) {
        console.error('Auth check error:', error)
        alert(i18n.errorAuth)
      } finally {
        setLoading(false)
      }
    }

    checkAuth()
  }, [])

  const fetchCampaigns = async (instructorId: string) => {
    try {
      const { data, error } = await supabase
        .from('boost_campaigns')
        .select('*, session:sessions(sport, date, start_time), post:instructor_posts(content)')
        .eq('instructor_id', instructorId)
        .order('created_at', { ascending: false })

      if (error) throw error
      setCampaigns(data || [])
    } catch (error) {
      console.error('Error fetching campaigns:', error)
      alert(i18n.errorFetch)
    }
  }

  const fetchSessions = async (creatorId: string) => {
    try {
      const today = new Date().toISOString().split('T')[0]
      const { data, error } = await supabase
        .from('sessions')
        .select('id, sport, date, start_time')
        .eq('creator_id', creatorId)
        .gte('date', today)
        .order('date', { ascending: true })

      if (error) throw error
      setSessions(data || [])
    } catch (error) {
      console.error('Error fetching sessions:', error)
    }
  }

  const fetchPosts = async (authorId: string) => {
    try {
      const { data, error } = await supabase
        .from('instructor_posts')
        .select('id, content')
        .eq('author_id', authorId)
        .order('created_at', { ascending: false })
        .limit(20)

      if (error) throw error
      setPosts(data || [])
    } catch (error) {
      console.error('Error fetching posts:', error)
    }
  }

  const calculateTotalMetrics = () => {
    const active = campaigns.filter(c => c.status === 'active')
    const totalImpressions = active.reduce((sum, c) => sum + (c.impressions || 0), 0)
    const totalClicks = active.reduce((sum, c) => sum + (c.clicks || 0), 0)
    const totalSpent = active.reduce((sum, c) => sum + c.spent_cents, 0)
    const avgCTR = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : '0.00'

    return { totalImpressions, totalClicks, avgCTR, totalSpent }
  }

  const getBoostLabel = (campaign: BoostCampaign) => {
    if (campaign.boost_type === 'session' && campaign.session) {
      return `${campaign.session.sport} - ${new Date(campaign.session.date).toLocaleDateString()}`
    } else if (campaign.boost_type === 'post' && campaign.post) {
      return campaign.post.content.substring(0, 50) + (campaign.post.content.length > 50 ? '...' : '')
    }
    return i18n.profile
  }

  const getDaysRemaining = (endsAt: string) => {
    const now = new Date()
    const end = new Date(endsAt)
    const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    return Math.max(0, diff)
  }

  const formatCurrency = (cents: number, cur: Currency) => {
    if (cur === 'COP') {
      return `$${(cents / 100).toLocaleString('es-CO')}`
    }
    return `$${(cents / 100).toFixed(2)}`
  }

  const getTotalBudget = () => {
    const tierConfig = TIER_CONFIG[selectedTier]
    const dailyCents = currency === 'COP' ? tierConfig.dailyCopCents : tierConfig.dailyUsdCents
    return dailyCents * duration
  }

  /**
   * Creates a boost campaign. Two paths:
   *
   * 1. TRIAL ACTIVE → Insert directly (free). No payment needed.
   * 2. TRIAL EXPIRED → Route to payment gateway first:
   *    - COP → Wompi checkout
   *    - USD → Stripe checkout
   *    On success (webhook confirms payment), campaign is activated.
   *    For now, we store the campaign as 'pending_payment' and redirect
   *    to the appropriate payment checkout URL.
   */
  const handleCreateBoost = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userId) return

    try {
      setIsSubmitting(true)

      const now = new Date()
      const endsAt = new Date(now.getTime() + duration * 24 * 60 * 60 * 1000)
      const isFree = isFeatureFree(instructorSince)

      const boostData = {
        instructor_id: userId,
        boost_type: boostType,
        session_id: boostType === 'session' ? selectedSession : null,
        post_id: boostType === 'post' ? selectedPost : null,
        tier: selectedTier,
        status: isFree ? 'active' : 'pending_payment',
        total_budget_cents: getTotalBudget(),
        spent_cents: 0,
        starts_at: now.toISOString(),
        ends_at: endsAt.toISOString(),
        impressions: 0,
        clicks: 0,
        currency: currency
      }

      // Insert the campaign record
      const { data: campaign, error } = await supabase
        .from('boost_campaigns')
        .insert(boostData)
        .select('id')
        .single()

      if (error) throw error

      if (isFree) {
        // Free trial — campaign is immediately active
        alert(i18n.successCreate)
      } else {
        // Payment required — redirect to checkout
        const totalBudget = getTotalBudget()
        const campaignId = campaign.id

        // Call our payment API which handles both Stripe and Wompi routing
        const response = await fetch('/api/payment/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            amount_cents: totalBudget,
            currency: currency,
            payment_type: 'boost_campaign',
            reference_id: campaignId,
            success_url: `${window.location.origin}/promote/boosts?payment=success&campaign=${campaignId}`,
            cancel_url: `${window.location.origin}/promote/boosts?payment=cancelled&campaign=${campaignId}`,
          }),
        })

        const paymentResult = await response.json()

        if (paymentResult.checkout_url) {
          // Redirect to Stripe or Wompi checkout page
          window.location.href = paymentResult.checkout_url
          return
        } else {
          // Payment creation failed — remove the pending campaign
          await supabase.from('boost_campaigns').delete().eq('id', campaignId)
          throw new Error(paymentResult.error || 'Payment creation failed')
        }
      }

      setShowNewBoostForm(false)
      setBoostType('session')
      setSelectedSession('')
      setSelectedPost('')
      setSelectedTier('growth')
      setDuration(7)
      setCurrency('USD')
      await fetchCampaigns(userId)
    } catch (error) {
      console.error('Error creating boost:', error)
      alert(i18n.errorCreate)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle payment return (success/cancelled from Stripe/Wompi redirect)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const paymentStatus = params.get('payment')
    const campaignId = params.get('campaign')

    if (paymentStatus === 'success' && campaignId) {
      // Activate the campaign after successful payment
      supabase
        .from('boost_campaigns')
        .update({ status: 'active' })
        .eq('id', campaignId)
        .then(() => {
          alert(i18n.successCreate)
          // Clean URL
          window.history.replaceState({}, '', '/promote/boosts')
          if (userId) fetchCampaigns(userId)
        })
    } else if (paymentStatus === 'cancelled' && campaignId) {
      // Remove the pending campaign
      supabase
        .from('boost_campaigns')
        .delete()
        .eq('id', campaignId)
        .eq('status', 'pending_payment')
        .then(() => {
          window.history.replaceState({}, '', '/promote/boosts')
          if (userId) fetchCampaigns(userId)
        })
    }
  }, [userId])

  const handlePauseCampaign = async (campaignId: string) => {
    try {
      const { error } = await supabase
        .from('boost_campaigns')
        .update({ status: 'paused' })
        .eq('id', campaignId)

      if (error) throw error
      if (userId) await fetchCampaigns(userId)
    } catch (error) {
      console.error('Error pausing campaign:', error)
      alert('Error pausing campaign')
    }
  }

  const handleCancelCampaign = async (campaignId: string) => {
    try {
      const { error } = await supabase
        .from('boost_campaigns')
        .update({ status: 'cancelled' })
        .eq('id', campaignId)

      if (error) throw error
      if (userId) await fetchCampaigns(userId)
    } catch (error) {
      console.error('Error cancelling campaign:', error)
      alert('Error cancelling campaign')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-theme-page flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-tribe-green"></div>
          <p className="mt-4 text-theme-secondary">Loading...</p>
        </div>
      </div>
    )
  }

  if (!isInstructor) {
    return (
      <div className="min-h-screen bg-theme-page flex items-center justify-center">
        <div className="text-center">
          <p className="text-xl text-red-500">{i18n.errorAuth}</p>
        </div>
      </div>
    )
  }

  const activeCampaigns = campaigns.filter(c => c.status === 'active')
  const pastCampaigns = campaigns.filter(c => c.status !== 'active')
  const { totalImpressions, totalClicks, avgCTR, totalSpent } = calculateTotalMetrics()

  return (
    <div className="min-h-screen bg-theme-page pb-32">
      {/* Fixed Header */}
      <div className="fixed top-0 left-0 right-0 z-40 safe-area-top bg-theme-card border-b border-theme">
        <div className="max-w-2xl mx-auto h-14 flex items-center px-4">
          <Link href="/promote" className="flex items-center gap-2 text-tribe-green hover:text-tribe-green/80 transition">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex-1 ml-3">
            <h1 className="text-lg font-bold text-theme-primary">{i18n.boostCampaigns}</h1>
            <p className="text-xs text-theme-secondary">
              {activeCampaigns.length} {activeCampaigns.length === 1 ? i18n.activeCampaigns.toLowerCase() : i18n.activeCampaigns.toLowerCase()}
            </p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="pt-header max-w-2xl mx-auto p-4 space-y-4">
        {/* Trial Banner */}
        <TrialBanner instructorSince={instructorSince} />

        {/* Metrics Row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="border-tribe-green/30 bg-gradient-to-br from-tribe-green/10 to-lime-50 dark:from-tribe-green/5 dark:to-green-900/20 rounded-2xl p-4 border">
            <div className="flex items-center justify-between mb-2">
              <span className="text-theme-secondary text-xs">{i18n.totalImpressions}</span>
              <Eye size={14} className="text-tribe-green" />
            </div>
            <p className="text-xl font-bold text-tribe-green">{totalImpressions.toLocaleString()}</p>
          </div>
          <div className="border-tribe-green/30 bg-gradient-to-br from-tribe-green/10 to-lime-50 dark:from-tribe-green/5 dark:to-green-900/20 rounded-2xl p-4 border">
            <div className="flex items-center justify-between mb-2">
              <span className="text-theme-secondary text-xs">{i18n.totalClicks}</span>
              <MousePointerClick size={14} className="text-tribe-green" />
            </div>
            <p className="text-xl font-bold text-tribe-green">{totalClicks.toLocaleString()}</p>
          </div>
          <div className="border-tribe-green/30 bg-gradient-to-br from-tribe-green/10 to-lime-50 dark:from-tribe-green/5 dark:to-green-900/20 rounded-2xl p-4 border">
            <div className="flex items-center justify-between mb-2">
              <span className="text-theme-secondary text-xs">{i18n.avgCTR}</span>
              <TrendingUp size={14} className="text-tribe-green" />
            </div>
            <p className="text-xl font-bold text-tribe-green">{avgCTR}%</p>
          </div>
          <div className="border-tribe-green/30 bg-gradient-to-br from-tribe-green/10 to-lime-50 dark:from-tribe-green/5 dark:to-green-900/20 rounded-2xl p-4 border">
            <div className="flex items-center justify-between mb-2">
              <span className="text-theme-secondary text-xs">{i18n.totalSpent}</span>
              <DollarSign size={14} className="text-tribe-green" />
            </div>
            <p className="text-xl font-bold text-tribe-green">{formatCurrency(totalSpent, currency)}</p>
          </div>
        </div>

        {/* Create Boost Button */}
        <button
          onClick={() => setShowNewBoostForm(true)}
          className="w-full bg-tribe-green text-slate-900 hover:bg-[#8FD642] font-semibold rounded-xl py-3 flex items-center justify-center gap-2 transition"
        >
          <Plus size={20} />
          {i18n.newBoost}
        </button>

        {/* Active Campaigns */}
        <div>
          <h2 className="text-lg font-bold text-theme-primary mb-3 flex items-center gap-2">
            <Zap size={20} className="text-tribe-green" />
            {i18n.activeCampaigns}
          </h2>

          {activeCampaigns.length === 0 ? (
            <div className="bg-white dark:bg-[#272D34] rounded-2xl p-8 border border-stone-200 dark:border-gray-700 text-center">
              <p className="text-theme-secondary mb-4">{i18n.noCampaigns}</p>
              <button
                onClick={() => setShowNewBoostForm(true)}
                className="inline-flex items-center gap-2 bg-tribe-green text-slate-900 hover:bg-[#8FD642] font-semibold rounded-xl py-2 px-4 transition"
              >
                <Plus size={16} />
                {i18n.newBoost}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {activeCampaigns.map(campaign => {
                const tierConfig = TIER_CONFIG[campaign.tier]
                const daysLeft = getDaysRemaining(campaign.ends_at)
                const progressPercent = Math.min(100, (campaign.spent_cents / campaign.total_budget_cents) * 100)
                const ctr = campaign.impressions > 0 ? ((campaign.clicks / campaign.impressions) * 100).toFixed(2) : '0.00'

                return (
                  <div key={campaign.id} className="bg-white dark:bg-[#272D34] rounded-2xl p-5 border border-stone-200 dark:border-gray-700">
                    {/* Header with Status */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <p className="text-xs text-theme-secondary mb-1">{getBoostLabel(campaign)}</p>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-1 rounded-full text-xs font-bold ${tierConfig.color} ${tierConfig.textColor}`}>
                            {tierConfig.badge}
                          </span>
                          <div className="flex items-center gap-1">
                            <div className="w-2 h-2 bg-tribe-green rounded-full animate-pulse"></div>
                            <span className="text-xs font-bold text-tribe-green">{i18n.live}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Budget Progress */}
                    <div className="mb-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-theme-secondary">{i18n.budgetProgress}</span>
                        <span className="text-xs text-theme-secondary">{progressPercent.toFixed(0)}%</span>
                      </div>
                      <div className="w-full bg-stone-200 dark:bg-[#52575D] rounded-full h-2">
                        <div
                          className="h-2 rounded-full transition-all bg-tribe-green"
                          style={{ width: `${progressPercent}%` }}
                        ></div>
                      </div>
                    </div>

                    {/* Days Remaining */}
                    <div className="mb-3 flex items-center gap-2 text-sm">
                      <Calendar size={14} className="text-theme-secondary" />
                      <span className="text-theme-secondary text-xs">
                        {daysLeft} {daysLeft === 1 ? i18n.day : i18n.days} {i18n.daysRemaining.toLowerCase()}
                      </span>
                    </div>

                    {/* Metrics */}
                    <div className="grid grid-cols-3 gap-2 mb-4 p-3 bg-stone-100 dark:bg-[#3D4349] rounded-lg">
                      <div className="text-center">
                        <p className="text-xs text-theme-secondary mb-1">{i18n.impressions}</p>
                        <p className="font-bold text-sm text-theme-primary">{campaign.impressions.toLocaleString()}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-theme-secondary mb-1">{i18n.clicks}</p>
                        <p className="font-bold text-sm text-theme-primary">{campaign.clicks.toLocaleString()}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-theme-secondary mb-1">{i18n.ctr}</p>
                        <p className="font-bold text-sm text-theme-primary">{ctr}%</p>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => handlePauseCampaign(campaign.id)}
                        className="flex-1 flex items-center justify-center gap-2 bg-stone-100 dark:bg-[#3D4349] text-stone-700 dark:text-gray-300 rounded-xl py-2 transition text-sm font-medium"
                      >
                        <Pause size={14} />
                        {i18n.pause}
                      </button>
                      <button
                        onClick={() => handleCancelCampaign(campaign.id)}
                        className="flex-1 flex items-center justify-center gap-2 bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 rounded-xl py-2 transition text-sm font-medium"
                      >
                        <X size={14} />
                        {i18n.cancel}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Past Campaigns */}
        {pastCampaigns.length > 0 && (
          <div>
            <h2 className="text-lg font-bold text-theme-primary mb-3">{i18n.pastCampaigns}</h2>
            <div className="space-y-3">
              {pastCampaigns.map(campaign => {
                const tierConfig = TIER_CONFIG[campaign.tier]
                const ctr = campaign.impressions > 0 ? ((campaign.clicks / campaign.impressions) * 100).toFixed(2) : '0.00'

                return (
                  <div key={campaign.id} className="bg-white dark:bg-[#272D34] rounded-2xl p-5 border border-stone-200 dark:border-gray-700 opacity-75">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <p className="text-xs text-theme-secondary mb-1">{getBoostLabel(campaign)}</p>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-1 rounded-full text-xs font-bold ${tierConfig.color} ${tierConfig.textColor}`}>
                            {tierConfig.badge}
                          </span>
                          <span className="text-xs text-theme-secondary">
                            {campaign.status === 'completed' && i18n.completed}
                            {campaign.status === 'cancelled' && i18n.cancelled}
                            {campaign.status === 'paused' && i18n.paused}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 p-3 bg-stone-100 dark:bg-[#3D4349] rounded-lg">
                      <div className="text-center">
                        <p className="text-xs text-theme-secondary mb-1">{i18n.impressions}</p>
                        <p className="font-bold text-sm text-theme-primary">{campaign.impressions.toLocaleString()}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-theme-secondary mb-1">{i18n.clicks}</p>
                        <p className="font-bold text-sm text-theme-primary">{campaign.clicks.toLocaleString()}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-theme-secondary mb-1">{i18n.ctr}</p>
                        <p className="font-bold text-sm text-theme-primary">{ctr}%</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* New Boost Modal */}
      {showNewBoostForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#272D34] rounded-2xl border border-stone-200 dark:border-gray-700 max-w-lg w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="border-b border-stone-200 dark:border-gray-700 p-5 flex items-center justify-between sticky top-0 bg-white dark:bg-[#272D34]">
              <h2 className="text-lg font-bold text-theme-primary flex items-center gap-2">
                <Zap size={20} className="text-tribe-green" />
                {i18n.createNewBoost}
              </h2>
              <button
                onClick={() => setShowNewBoostForm(false)}
                className="text-theme-secondary hover:text-theme-primary transition"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Content */}
            <form onSubmit={handleCreateBoost} className="p-5 space-y-4">
              {/* What to Boost */}
              <div>
                <label className="block text-sm font-bold text-theme-primary mb-2">{i18n.whatToBoost}</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: 'session' as BoostType, label: i18n.session, icon: Radio },
                    { value: 'post' as BoostType, label: i18n.post, icon: MessageSquare },
                    { value: 'profile' as BoostType, label: i18n.profile, icon: User }
                  ].map(option => {
                    const Icon = option.icon
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          setBoostType(option.value)
                          setSelectedSession('')
                          setSelectedPost('')
                        }}
                        className={`p-3 rounded-lg border transition flex flex-col items-center justify-center gap-1 text-xs ${
                          boostType === option.value
                            ? 'border-tribe-green bg-tribe-green/20'
                            : 'border-stone-200 dark:border-gray-700'
                        }`}
                      >
                        <Icon size={16} />
                        <span className="font-medium">{option.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Session Selection */}
              {boostType === 'session' && (
                <div>
                  <label className="block text-sm font-bold text-theme-primary mb-2">{i18n.selectSession}</label>
                  <select
                    value={selectedSession}
                    onChange={e => setSelectedSession(e.target.value)}
                    className="w-full bg-white dark:bg-[#3D4349] border border-stone-200 dark:border-[#52575D] rounded-lg px-4 py-3 text-theme-primary focus:outline-none focus:border-tribe-green"
                    required
                  >
                    <option value="">{i18n.selectOption}</option>
                    {sessions.length === 0 ? (
                      <option disabled>{i18n.noUpcomingSessions}</option>
                    ) : (
                      sessions.map(session => (
                        <option key={session.id} value={session.id}>
                          {session.sport} - {new Date(session.date).toLocaleDateString()}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              )}

              {/* Post Selection */}
              {boostType === 'post' && (
                <div>
                  <label className="block text-sm font-bold text-theme-primary mb-2">{i18n.selectPost}</label>
                  <select
                    value={selectedPost}
                    onChange={e => setSelectedPost(e.target.value)}
                    className="w-full bg-white dark:bg-[#3D4349] border border-stone-200 dark:border-[#52575D] rounded-lg px-4 py-3 text-theme-primary focus:outline-none focus:border-tribe-green"
                    required
                  >
                    <option value="">{i18n.selectOption}</option>
                    {posts.length === 0 ? (
                      <option disabled>{i18n.noRecentPosts}</option>
                    ) : (
                      posts.map(post => (
                        <option key={post.id} value={post.id}>
                          {post.content.substring(0, 60)}
                          {post.content.length > 60 ? '...' : ''}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              )}

              {/* Tier Selection */}
              <div>
                <label className="block text-sm font-bold text-theme-primary mb-2">{i18n.chooseATier}</label>
                <div className="grid grid-cols-1 gap-2">
                  {(['starter', 'growth', 'spotlight'] as const).map(tier => {
                    const config = TIER_CONFIG[tier]
                    const dailyCost = currency === 'COP' ? `$${(config.dailyCopCents / 100).toLocaleString('es-CO')}` : `$${(config.dailyUsdCents / 100).toFixed(2)}`

                    return (
                      <button
                        key={tier}
                        type="button"
                        onClick={() => setSelectedTier(tier)}
                        className={`p-3 rounded-lg border transition text-left text-sm ${
                          selectedTier === tier
                            ? `border-tribe-green bg-tribe-green/20`
                            : 'border-stone-200 dark:border-gray-700'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-theme-primary">{config.badge}</span>
                          {'recommended' in config && config.recommended && (
                            <span className="text-xs bg-tribe-green text-slate-900 px-2 py-1 rounded font-bold">
                              {i18n.recommended}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-theme-secondary mb-1">{dailyCost} {i18n.perDay}</p>
                        <p className="text-xs text-theme-secondary">
                          {config.impressions.toLocaleString()} {i18n.impressions}
                        </p>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Duration */}
              <div>
                <label className="block text-sm font-bold text-theme-primary mb-2">{i18n.duration}</label>
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={duration}
                  onChange={e => setDuration(Math.max(1, Math.min(30, parseInt(e.target.value) || 1)))}
                  className="w-full bg-white dark:bg-[#3D4349] border border-stone-200 dark:border-[#52575D] rounded-lg px-4 py-3 text-theme-primary focus:outline-none focus:border-tribe-green"
                />
              </div>

              {/* Currency Selection */}
              <div>
                <label className="block text-sm font-bold text-theme-primary mb-2">{i18n.currencyLabel}</label>
                <div className="grid grid-cols-2 gap-2">
                  {['USD', 'COP'].map(cur => (
                    <button
                      key={cur}
                      type="button"
                      onClick={() => setCurrency(cur as Currency)}
                      className={`p-3 rounded-lg border transition font-medium text-sm ${
                        currency === cur
                          ? 'border-tribe-green bg-tribe-green/20 text-theme-primary'
                          : 'border-stone-200 dark:border-gray-700 text-theme-secondary'
                      }`}
                    >
                      {cur}
                    </button>
                  ))}
                </div>
              </div>

              {/* Total Budget Display */}
              <div className="bg-stone-100 dark:bg-[#3D4349] border border-stone-200 dark:border-[#52575D] rounded-lg p-4">
                <p className="text-xs text-theme-secondary mb-1">{i18n.totalBudget}</p>
                <p className="text-2xl font-bold text-tribe-green">
                  {formatCurrency(getTotalBudget(), currency)}
                </p>
                <p className="text-xs text-theme-secondary mt-2">
                  {duration} {duration === 1 ? i18n.day : i18n.days} × {currency === 'COP' ? `$${(TIER_CONFIG[selectedTier].dailyCopCents / 100).toLocaleString('es-CO')}` : `$${(TIER_CONFIG[selectedTier].dailyUsdCents / 100).toFixed(2)}`}
                </p>
              </div>

              {/* Submit */}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewBoostForm(false)}
                  className="flex-1 bg-stone-100 dark:bg-[#3D4349] text-stone-700 dark:text-gray-300 rounded-xl py-3 font-semibold transition"
                >
                  {language === 'en' ? 'Cancel' : 'Cancelar'}
                </button>
                <button
                  type="submit"
                  disabled={
                    isSubmitting ||
                    (boostType === 'session' && !selectedSession) ||
                    (boostType === 'post' && !selectedPost)
                  }
                  className="flex-1 flex items-center justify-center gap-2 bg-tribe-green hover:bg-[#8FD642] text-slate-900 font-semibold rounded-xl py-3 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isFeatureFree(instructorSince) ? (
                    <>
                      <Gift size={18} />
                      {language === 'en' ? 'Launch Free Boost' : 'Lanzar Impulso Gratis'}
                    </>
                  ) : (
                    <>
                      <CreditCard size={18} />
                      {language === 'en'
                        ? `Pay & Launch (${formatCurrency(getTotalBudget(), currency)})`
                        : `Pagar y Lanzar (${formatCurrency(getTotalBudget(), currency)})`}
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  )
}
