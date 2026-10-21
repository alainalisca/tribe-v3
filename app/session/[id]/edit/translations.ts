export function getEditSessionTranslations(language: 'en' | 'es') {
  return language === 'es'
    ? {
        editSession: 'Editar Sesi\u00f3n',
        recurringSection: 'Recurrencia',
        seriesOccurrenceNotice:
          'Esta es una sesi\u00f3n de una serie ({cadence}). Los cambios afectan solo esta fecha.',
        seriesTemplateNotice:
          'Esta es la plantilla de la serie. Los cambios afectan las sesiones futuras, no las ya publicadas.',
        save: 'Guardar Cambios',
        saving: 'Guardando...',
        cancel: 'Cancelar',
        updated: 'Sesi\u00f3n actualizada',
        paidSession: 'Sesi\u00f3n de pago',
        paidSessionHint: 'Cobra a los atletas por esta sesi\u00f3n',
        currency: 'Moneda',
        price: 'Precio',
        breakdown: 'Desglose de pago',
        athletePays: 'Precio del atleta',
        platformFee: 'Tarifa de plataforma (15%)',
        youEarn: 'T\u00fa recibes (85%)',
        paymentInstructions: 'Instrucciones de pago',
        paymentInstructionsPlaceholder: 'Ej: Nequi: 300-123-4567 o efectivo en el lugar',
        priceRequired: 'El precio es obligatorio para sesiones de pago',
        minUsd: 'El precio m\u00ednimo es $5.00 USD',
        minCop: 'El precio m\u00ednimo es 20.000 COP',
        instructionsRequired: 'Las instrucciones de pago son obligatorias',
        notOwner: 'Solo el anfitri\u00f3n puede editar esta sesi\u00f3n',
        pastLocked: 'Las sesiones pasadas no se pueden editar',
        confirmPriceTitle: 'Atletas ya inscritos',
        confirmPriceMessage:
          'Algunos atletas ya se unieron a esta sesi\u00f3n cuando era gratis. Recibir\u00e1n el nuevo precio al volver a abrirla. \u00bfCambiar el precio de todos modos?',
        confirmPriceYes: 'Cambiar precio',
        confirmPriceNo: 'Cancelar',
      }
    : {
        editSession: 'Edit Session',
        recurringSection: 'Recurrence',
        seriesOccurrenceNotice: 'This is one session in a series ({cadence}). Changes affect only this date.',
        seriesTemplateNotice:
          'This is the series template. Changes affect future sessions, not ones already published.',
        save: 'Save Changes',
        saving: 'Saving...',
        cancel: 'Cancel',
        updated: 'Session updated',
        paidSession: 'Paid Session',
        paidSessionHint: 'Charge athletes for this session',
        currency: 'Currency',
        price: 'Price',
        breakdown: 'Payment Breakdown',
        athletePays: 'Athlete pays',
        platformFee: 'Platform fee (15%)',
        youEarn: 'You earn (85%)',
        paymentInstructions: 'Payment Instructions',
        paymentInstructionsPlaceholder: 'E.g. Nequi: 300-123-4567, Venmo: @coach-maria, or cash at venue',
        priceRequired: 'Price is required for paid sessions',
        minUsd: 'Minimum price is $5.00 USD',
        minCop: 'Minimum price is 20,000 COP',
        instructionsRequired: 'Payment instructions are required for paid sessions',
        notOwner: 'Only the host can edit this session',
        pastLocked: 'Past sessions cannot be edited',
        confirmPriceTitle: 'Athletes already joined',
        confirmPriceMessage:
          'Some athletes joined this session while it was free. They will see the new price the next time they open it. Change the price anyway?',
        confirmPriceYes: 'Change price',
        confirmPriceNo: 'Cancel',
      };
}

export type EditSessionTranslations = ReturnType<typeof getEditSessionTranslations>;
