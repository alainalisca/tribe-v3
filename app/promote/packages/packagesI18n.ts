export const translations = {
  en: {
    title: 'Service Packages',
    subtitle: 'active packages',
    createButton: 'Create Package',
    formTitle: 'New Service Package',
    name: 'Package Name',
    namePlaceholder: '10-Session Training Pack',
    description: 'Description',
    descriptionPlaceholder: 'What does this package include?',
    priceCents: 'Price',
    pricePlaceholder: 'e.g. 150000 for COP $150,000',
    currency: 'Currency',
    packageType: 'Package Type',
    sessionPack: 'Session Pack',
    membership: 'Membership',
    custom: 'Custom',
    sessionCount: 'Number of Sessions (optional)',
    durationDays: 'Duration in Days (optional)',
    tag: 'Tag (optional)',
    tagPlaceholder: 'Popular, Best Value…',
    create: 'Create Package',
    cancel: 'Cancel',
    emptyState: 'No packages yet',
    emptyDescription: 'Create your first service package to display on your storefront.',
    errorAuth: 'You must be logged in as an instructor to manage packages.',
    errorFetch: 'Failed to load packages.',
    errorCreate: 'Failed to create package.',
    successCreate: 'Package created successfully.',
    nameRequired: 'Package name is required.',
    priceRequired: 'Price is required and must be greater than zero.',
    sessions: 'sessions',
    days: 'days',
    active: 'Active',
    deactivated: 'Deactivated',
    deactivate: 'Deactivate',
    reactivate: 'Reactivate',
  },
  es: {
    title: 'Paquetes de Servicio',
    subtitle: 'paquetes activos',
    createButton: 'Crear Paquete',
    formTitle: 'Nuevo Paquete de Servicio',
    name: 'Nombre del Paquete',
    namePlaceholder: 'Paquete de 10 Sesiones',
    description: 'Descripción',
    descriptionPlaceholder: '¿Qué incluye este paquete?',
    priceCents: 'Precio',
    pricePlaceholder: 'ej. 150000 para COP $150,000',
    currency: 'Moneda',
    packageType: 'Tipo de Paquete',
    sessionPack: 'Pack de Sesiones',
    membership: 'Membresía',
    custom: 'Personalizado',
    sessionCount: 'Número de Sesiones (opcional)',
    durationDays: 'Duración en Días (opcional)',
    tag: 'Etiqueta (opcional)',
    tagPlaceholder: 'Popular, Mejor Valor…',
    create: 'Crear Paquete',
    cancel: 'Cancelar',
    emptyState: 'Sin paquetes aún',
    emptyDescription: 'Crea tu primer paquete de servicio para mostrarlo en tu escaparate.',
    errorAuth: 'Debes estar conectado como instructor para gestionar paquetes.',
    errorFetch: 'No se pudieron cargar los paquetes.',
    errorCreate: 'No se pudo crear el paquete.',
    successCreate: 'Paquete creado exitosamente.',
    nameRequired: 'El nombre del paquete es obligatorio.',
    priceRequired: 'El precio es obligatorio y debe ser mayor que cero.',
    sessions: 'sesiones',
    days: 'días',
    active: 'Activo',
    deactivated: 'Desactivado',
    deactivate: 'Desactivar',
    reactivate: 'Reactivar',
  },
} as const;

export type TranslationShape = (typeof translations)[keyof typeof translations];

export interface FormState {
  name: string;
  description: string;
  priceCents: string;
  currency: 'COP' | 'USD';
  packageType: 'session_pack' | 'membership' | 'custom';
  sessionCount: string;
  durationDays: string;
  tag: string;
}

export const defaultForm: FormState = {
  name: '',
  description: '',
  priceCents: '',
  currency: 'COP',
  packageType: 'session_pack',
  sessionCount: '',
  durationDays: '',
  tag: '',
};
