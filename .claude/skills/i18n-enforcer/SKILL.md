---
name: i18n-enforcer
description: "Ensures all user-facing text is bilingual (Spanish and English). Triggers whenever Claude writes JSX that contains text visible to users — button labels, headings, descriptions, placeholder text, error messages, success messages, empty states, tooltips, or any string rendered in the UI. If you're writing text that a user will see, this skill applies. Also triggers when the user mentions 'translation', 'Spanish', 'English', 'bilingual', 'i18n', or 'language'."
---

# i18n Enforcer

Every user-facing string must be available in both English and Spanish. The app serves users in Medellín, Colombia — untranslated English signals "unfinished."

## Translation Pattern

Use the project's established pattern — the `useLanguage()` hook and inline ternaries:

```tsx
const { t, language } = useLanguage();

// For strings in the translation file:
<h1>{t('pageTitle')}</h1>

// For strings not in the translation file (inline):
<p>{language === 'es' ? 'Sesión cancelada' : 'Session cancelled'}</p>

// For dynamic strings:
<p>{language === 'es' ? `${count} sesiones` : `${count} sessions`}</p>
```

## Rules

1. **Every visible string needs both languages** — headings, buttons, labels, placeholders, toasts, error messages, empty states
2. **Use the `t()` function** when the string exists in the translation files
3. **Use inline ternaries** for one-off strings: `language === 'es' ? 'Spanish' : 'English'`
4. **Spanish first in ternaries** — keep the pattern consistent: `language === 'es' ? ES : EN`
5. **Don't translate**: proper nouns (Tribe, CrossFit), technical terms users know (app, link), emoji
6. **Placeholders count** — `<input placeholder={...}>` must be bilingual
7. **Toast messages count** — `showSuccess()`, `showError()`, `showInfo()` must be bilingual
8. **Alt text is exempt** — image alt attributes can be English-only

## Checklist

Before finalizing any UI code, scan for:
- [ ] All button text has both languages
- [ ] All headings have both languages
- [ ] All placeholder text has both languages
- [ ] All error/success/info toasts have both languages
- [ ] All empty state messages have both languages
- [ ] All form labels have both languages

## Common Translations Reference

| English | Spanish |
|---------|---------|
| Join Session | Unirse a la Sesión |
| Leave Session | Salir de Sesión |
| Cancel | Cancelar |
| Save | Guardar |
| Loading... | Cargando... |
| Error | Error |
| Success | Éxito |
| No results | Sin resultados |
| Try again | Intentar de nuevo |
| Sessions | Sesiones |
| Profile | Perfil |
| Settings | Configuración |
