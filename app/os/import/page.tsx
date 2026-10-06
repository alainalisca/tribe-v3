'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLanguage } from '@/lib/LanguageContext';
import { useTribeOSPremiumGate } from '@/hooks/useTribeOSPremiumGate';
import { trackEvent } from '@/lib/analytics';
import { Button, Badge } from '@/components/tribe-os/ui';
import { Upload, FileSpreadsheet, AlertTriangle, CheckCircle2, Download } from 'lucide-react';
import Papa from 'papaparse';
import { detectDateFormat, humanizeImportError } from '@/lib/tribe-os/import/parse';
import type { SlashFormat } from '@/lib/tribe-os/import/parse';

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

const copy = {
  en: {
    pageTitle: 'Import',
    subtitle: 'Upload your gym data',
    loading: 'Loading',
    redirecting: 'Redirecting',
    tabMembers: 'Members',
    tabVisits: 'Visits',
    uploadTitle: 'Upload CSV',
    uploadHint: 'Drag a CSV file or click to browse',
    chooseFile: 'Choose file',
    mapping: 'Map columns',
    mappingHint: 'Match each CSV column to a Tribe field',
    skip: '— Skip —',
    preview: 'Preview',
    previewHint: 'First 10 rows after mapping',
    confirm: 'Import',
    importing: 'Importing…',
    back: 'Back',
    resultTitle: 'Import complete',
    resultTitleFailed: 'Import failed',
    resultTitlePartial: 'Import completed with errors',
    resultTitleAllDups: 'Nothing new to import',
    inserted: 'Inserted',
    updated: 'Updated',
    skipped: 'Errors',
    alreadyExisted: 'Already existed',
    allDupsMessage: 'All {count} visits were already in the system. Nothing duplicated.',
    newAndDupsMessage: '{inserted} new visits, {dupes} already existed.',
    downloadErrors: 'Download error rows',
    importAnother: 'Import another file',
    errorRow: 'Row error',
    dateFormatDM: 'Day/Month',
    dateFormatMD: 'Month/Day',
    dateConflict:
      'This column has conflicting date formats — some rows have day first, others month first. Fix the CSV.',
    memberFields: {
      name: 'Name',
      email: 'Email',
      phone: 'Phone',
      external_id: 'Member ID',
      status: 'Status',
      joined_on: 'Joined date',
      membership_plan: 'Plan',
      plan_ends_on: 'Plan end date',
    } as Record<string, string>,
    visitFields: {
      external_id: 'Member ID',
      email: 'Email',
      phone: 'Phone',
      visit_date: 'Visit date',
      visit_time: 'Visit time',
      class_name: 'Class',
      coach_name: 'Coach',
    } as Record<string, string>,
  },
  es: {
    pageTitle: 'Importar',
    subtitle: 'Sube los datos de tu gym',
    loading: 'Cargando',
    redirecting: 'Redirigiendo',
    tabMembers: 'Miembros',
    tabVisits: 'Visitas',
    uploadTitle: 'Subir CSV',
    uploadHint: 'Arrastra un archivo CSV o haz clic para buscar',
    chooseFile: 'Elegir archivo',
    mapping: 'Mapear columnas',
    mappingHint: 'Asocia cada columna del CSV con un campo de Tribe',
    skip: '— Omitir —',
    preview: 'Vista previa',
    previewHint: 'Primeras 10 filas mapeadas',
    confirm: 'Importar',
    importing: 'Importando…',
    back: 'Volver',
    resultTitle: 'Importación completa',
    resultTitleFailed: 'La importación falló',
    resultTitlePartial: 'Importación con errores',
    resultTitleAllDups: 'Nada nuevo que importar',
    inserted: 'Insertados',
    updated: 'Actualizados',
    skipped: 'Errores',
    alreadyExisted: 'Ya existían',
    allDupsMessage: 'Las {count} visitas ya estaban en el sistema. No se duplicó nada.',
    newAndDupsMessage: '{inserted} visitas nuevas, {dupes} ya existían.',
    downloadErrors: 'Descargar filas con error',
    importAnother: 'Importar otro archivo',
    errorRow: 'Error en fila',
    dateFormatDM: 'Día/Mes',
    dateFormatMD: 'Mes/Día',
    dateConflict: 'Esta columna tiene formatos de fecha contradictorios. Corrige el CSV.',
    memberFields: {
      name: 'Nombre',
      email: 'Correo',
      phone: 'Celular',
      external_id: 'ID Socio',
      status: 'Estado',
      joined_on: 'Fecha de inscripción',
      membership_plan: 'Plan',
      plan_ends_on: 'Fecha de vencimiento',
    } as Record<string, string>,
    visitFields: {
      external_id: 'ID Socio',
      email: 'Correo',
      phone: 'Celular',
      visit_date: 'Fecha de visita',
      visit_time: 'Hora',
      class_name: 'Clase',
      coach_name: 'Coach',
    } as Record<string, string>,
  },
} as const;

type Tab = 'members' | 'visits';
type Step = 'upload' | 'mapping' | 'preview' | 'importing' | 'result';

interface ImportError {
  row: number;
  error: string;
  data?: Record<string, string>;
}

interface ImportResult {
  import_id: string;
  inserted: number;
  updated: number;
  skipped: number;
  already_existed: number;
  errors: ImportError[];
}

const MEMBER_FIELDS = [
  'name',
  'email',
  'phone',
  'external_id',
  'status',
  'joined_on',
  'membership_plan',
  'plan_ends_on',
];
const VISIT_FIELDS = ['external_id', 'email', 'phone', 'visit_date', 'visit_time', 'class_name', 'coach_name'];

const DATE_FIELDS = new Set(['joined_on', 'plan_ends_on', 'visit_date']);
const GYM_TZ = 'America/Bogota';
const BATCH_SIZE = 500;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function guessMapping(csvHeaders: string[], tribeFields: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  const aliases: Record<string, string[]> = {
    name: ['nombre', 'name', 'nombre completo', 'full name'],
    email: ['correo', 'email', 'correo electrónico', 'e-mail', 'mail'],
    phone: ['celular', 'phone', 'teléfono', 'telefono', 'tel', 'móvil', 'movil', 'whatsapp'],
    external_id: ['id socio', 'member id', 'id', 'external_id', 'socio', 'código', 'codigo', 'id miembro'],
    status: ['estado', 'status', 'estatus'],
    joined_on: [
      'fecha de inscripción',
      'fecha de inscripcion',
      'joined date',
      'joined',
      'fecha inscripcion',
      'fecha ingreso',
      'inscripción',
      'inscripcion',
    ],
    membership_plan: ['plan', 'membership plan', 'membresía', 'membresia', 'tipo plan'],
    plan_ends_on: [
      'vence',
      'plan end date',
      'vencimiento',
      'fecha de vencimiento',
      'fecha vencimiento',
      'expira',
      'expires',
    ],
    visit_date: ['fecha', 'date', 'visit date', 'fecha visita'],
    visit_time: ['hora', 'time', 'visit time', 'hora visita'],
    class_name: ['clase', 'class', 'actividad', 'activity'],
    coach_name: ['coach', 'instructor', 'entrenador', 'profesor'],
  };

  for (const field of tribeFields) {
    const fieldAliases = aliases[field] ?? [field];
    for (const csvH of csvHeaders) {
      const lower = csvH.toLowerCase().trim();
      if (fieldAliases.includes(lower) && !Object.values(map).includes(csvH)) {
        map[field] = csvH;
        break;
      }
    }
  }
  return map;
}

function applyMapping(rawRows: Record<string, string>[], mapping: Record<string, string>): Record<string, string>[] {
  return rawRows.map((row) => {
    const mapped: Record<string, string> = {};
    for (const [tribeField, csvCol] of Object.entries(mapping)) {
      if (csvCol && row[csvCol] !== undefined) {
        mapped[tribeField] = row[csvCol];
      }
    }
    return mapped;
  });
}

function downloadCsv(rows: Record<string, unknown>[], filename: string) {
  const csv = Papa.unparse(rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

interface DateFormatState {
  detected: SlashFormat | null;
  conflict: boolean;
  override: SlashFormat | null;
}

function detectFormatsFromData(
  rawRows: Record<string, string>[],
  mapping: Record<string, string>,
  fields: string[]
): Record<string, DateFormatState> {
  const result: Record<string, DateFormatState> = {};
  for (const field of fields) {
    if (!DATE_FIELDS.has(field) || !mapping[field]) continue;
    const csvCol = mapping[field];
    const values = rawRows.map((r) => r[csvCol] ?? '');
    const detected = detectDateFormat(values, GYM_TZ);
    if (detected.error) {
      result[field] = { detected: null, conflict: true, override: null };
    } else {
      result[field] = { detected: detected.format, conflict: false, override: null };
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ImportPage() {
  const { language } = useLanguage();
  const s = copy[language];
  const gate = useTribeOSPremiumGate();

  const [tab, setTab] = useState<Tab>('members');
  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState('');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [savedMappings, setSavedMappings] = useState<Record<string, Record<string, string>>>({});
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dateFormats, setDateFormats] = useState<Record<string, DateFormatState>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fields = tab === 'members' ? MEMBER_FIELDS : VISIT_FIELDS;
  const fieldLabels = tab === 'members' ? s.memberFields : s.visitFields;

  // Recompute date formats when mapping or rawRows change
  useEffect(() => {
    if (rawRows.length === 0) return;
    setDateFormats(detectFormatsFromData(rawRows, mapping, fields));
  }, [rawRows, mapping, fields]);

  // Check if any date column has an unresolved conflict
  const hasDateConflict = useMemo(
    () => Object.values(dateFormats).some((df) => df.conflict && !df.override),
    [dateFormats]
  );

  // Build the date_formats object for the API
  const apiDateFormats = useMemo(() => {
    const result: Record<string, SlashFormat> = {};
    for (const [field, df] of Object.entries(dateFormats)) {
      const fmt = df.override ?? df.detected;
      if (fmt) result[field] = fmt;
    }
    return result;
  }, [dateFormats]);

  // Load saved mappings
  useEffect(() => {
    if (gate.state !== 'allowed') return;
    (async () => {
      try {
        const res = await fetch(`/api/tribe-os/import/mappings?kind=${tab}`);
        const json = await res.json();
        if (json.success && json.data?.mapping) {
          setSavedMappings((prev) => ({ ...prev, [tab]: json.data.mapping }));
        }
      } catch {}
    })();
  }, [gate.state, tab]);

  const handleFile = useCallback(
    (file: File) => {
      setFileName(file.name);
      Papa.parse<Record<string, string>>(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const headers = results.meta.fields ?? [];
          setCsvHeaders(headers);
          setRawRows(results.data);
          const saved = savedMappings[tab];
          const autoMap = saved ?? guessMapping(headers, fields);
          setMapping(autoMap);
          setStep('mapping');
        },
      });
    },
    [fields, tab, savedMappings]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file?.name.endsWith('.csv')) handleFile(file);
    },
    [handleFile]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const mappedRows = applyMapping(rawRows, mapping);
  const previewRows = mappedRows.slice(0, 10);

  const handleImport = async () => {
    setStep('importing');
    const batches: Record<string, string>[][] = [];
    for (let i = 0; i < mappedRows.length; i += BATCH_SIZE) {
      batches.push(mappedRows.slice(i, i + BATCH_SIZE));
    }

    const endpoint = tab === 'members' ? '/api/tribe-os/import/members' : '/api/tribe-os/import/visits';
    let totalInserted = 0;
    let totalUpdated = 0;
    let totalSkipped = 0;
    let totalAlreadyExisted = 0;
    let allErrors: ImportResult['errors'] = [];
    let importId = '';

    for (const batch of batches) {
      try {
        const isSeed = fileName.startsWith('mira_like_');
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rows: batch,
            source: 'csv',
            file_name: fileName,
            date_formats: apiDateFormats,
            ...(isSeed ? { tags: ['seed'] } : {}),
          }),
        });
        const json = await res.json();
        if (json.success) {
          totalInserted += json.data.inserted;
          totalUpdated += json.data.updated;
          totalSkipped += json.data.skipped ?? 0;
          totalAlreadyExisted += json.data.already_existed ?? 0;
          const normalized: ImportError[] = (json.data.errors ?? []).map(
            (e: { index?: number; reason?: string; row?: Record<string, string>; error?: string }) => ({
              row: (e.index ?? 0) + 1,
              error: e.reason ?? e.error ?? 'unknown',
              data: typeof e.row === 'object' ? e.row : undefined,
            })
          );
          allErrors = allErrors.concat(normalized);
          importId = json.data.import_id;
        }
      } catch {}
    }

    // Save mapping for next time
    try {
      await fetch('/api/tribe-os/import/mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: tab, mapping }),
      });
    } catch {}

    // Trigger retention recompute after visits import
    if (tab === 'visits') {
      try {
        await fetch('/api/tribe-os/retention/recompute', { method: 'POST' });
      } catch {}
    }

    setResult({
      import_id: importId,
      inserted: totalInserted,
      updated: totalUpdated,
      skipped: totalSkipped,
      already_existed: totalAlreadyExisted,
      errors: allErrors,
    });
    trackEvent('tribe_os_import_completed', {
      kind: tab,
      inserted: totalInserted,
      updated: totalUpdated,
      skipped: totalSkipped,
    });
    setStep('result');
  };

  const resetFlow = () => {
    setStep('upload');
    setFileName('');
    setCsvHeaders([]);
    setRawRows([]);
    setMapping({});
    setDateFormats({});
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const switchTab = (t: Tab) => {
    setTab(t);
    resetFlow();
  };

  if (gate.state !== 'allowed') {
    return (
      <main className="flex items-center justify-center px-4 py-24">
        <p className="text-tribe-dark-80 text-sm uppercase tracking-[0.1em]">
          {gate.state === 'redirecting' ? s.redirecting : s.loading}...
        </p>
      </main>
    );
  }

  return (
    <div className="px-4 lg:px-8 py-6 lg:py-8">
      <div className="max-w-4xl mx-auto space-y-5">
        <header>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-tribe-dark">{s.pageTitle}</h1>
          <p className="text-sm text-tribe-dark-80 mt-1">{s.subtitle}</p>
        </header>

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-tribe p-1 w-fit">
          {(['members', 'visits'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => switchTab(t)}
              className={`px-4 py-2 text-sm font-medium rounded-tribe transition-colors ${
                tab === t ? 'bg-white text-tribe-dark shadow-sm' : 'text-tribe-dark-80 hover:text-tribe-dark'
              }`}
            >
              {t === 'members' ? s.tabMembers : s.tabVisits}
            </button>
          ))}
        </div>

        {/* Step: Upload */}
        {step === 'upload' && (
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className="border-2 border-dashed border-gray-300 rounded-tribe p-8 sm:p-12 text-center hover:border-tribe-green transition-colors cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-10 w-10 text-tribe-dark-80 mx-auto mb-3" />
            <p className="text-sm font-medium text-tribe-dark">{s.uploadTitle}</p>
            <p className="text-xs text-tribe-dark-80 mt-1">{s.uploadHint}</p>
            <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleFileInput} />
          </div>
        )}

        {/* Step: Mapping */}
        {step === 'mapping' && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-tribe-dark">{s.mapping}</h2>
                <p className="text-xs text-tribe-dark-80">{s.mappingHint}</p>
              </div>
              <Badge variant="info">{fileName}</Badge>
            </div>
            <div className="grid gap-3">
              {fields.map((field) => {
                const df = dateFormats[field];
                const isDateField = DATE_FIELDS.has(field) && mapping[field];
                return (
                  <div key={field} className="space-y-1">
                    <div className="flex items-center gap-3">
                      <label className="text-sm font-medium text-tribe-dark w-40 shrink-0">
                        {fieldLabels[field] ?? field}
                      </label>
                      <select
                        value={mapping[field] ?? ''}
                        onChange={(e) => setMapping((prev) => ({ ...prev, [field]: e.target.value }))}
                        className="flex-1 text-sm border border-gray-300 rounded-tribe px-3 py-2 bg-white text-tribe-dark"
                      >
                        <option value="">{s.skip}</option>
                        {csvHeaders.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>
                    {isDateField && df && (
                      <div className="ml-40 pl-3">
                        {df.conflict && !df.override ? (
                          <p className="text-xs text-red-600">{s.dateConflict}</p>
                        ) : (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                setDateFormats((prev) => ({
                                  ...prev,
                                  [field]: {
                                    ...prev[field],
                                    override: (df.override ?? df.detected) === 'dm' ? 'md' : 'dm',
                                    conflict: false,
                                  },
                                }))
                              }
                              className="text-xs px-2 py-0.5 rounded border border-gray-300 text-tribe-dark hover:bg-gray-50 transition-colors"
                            >
                              {(df.override ?? df.detected) === 'dm' ? s.dateFormatDM : s.dateFormatMD}
                            </button>
                            <span className="text-xs text-tribe-dark-80">
                              {(df.override ?? df.detected) === 'dm' ? '15/03 → Mar 15' : '03/15 → Mar 15'}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={resetFlow}>
                {s.back}
              </Button>
              <Button size="sm" onClick={() => setStep('preview')} disabled={hasDateConflict}>
                {s.preview}
              </Button>
            </div>
          </section>
        )}

        {/* Step: Preview */}
        {step === 'preview' && (
          <section className="space-y-4">
            <div>
              <h2 className="text-lg font-bold text-tribe-dark">{s.preview}</h2>
              <p className="text-xs text-tribe-dark-80">
                {s.previewHint} ({rawRows.length} total)
              </p>
            </div>
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="min-w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-3 py-2 text-left font-medium text-tribe-dark-80">#</th>
                    {fields
                      .filter((f) => mapping[f])
                      .map((f) => (
                        <th key={f} className="px-3 py-2 text-left font-medium text-tribe-dark-80">
                          {fieldLabels[f] ?? f}
                        </th>
                      ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, i) => {
                    const hasData = fields.some((f) => mapping[f] && row[f]?.trim());
                    return (
                      <tr key={i} className={`border-t border-gray-100 ${!hasData ? 'bg-red-50' : ''}`}>
                        <td className="px-3 py-2 text-tribe-dark-80">{i + 1}</td>
                        {fields
                          .filter((f) => mapping[f])
                          .map((f) => (
                            <td key={f} className="px-3 py-2 text-tribe-dark truncate max-w-[160px]">
                              {row[f] ?? ''}
                            </td>
                          ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setStep('mapping')}>
                {s.back}
              </Button>
              <Button size="sm" onClick={handleImport}>
                {s.confirm} ({rawRows.length})
              </Button>
            </div>
          </section>
        )}

        {/* Step: Importing */}
        {step === 'importing' && (
          <div className="py-16 text-center">
            <FileSpreadsheet className="h-10 w-10 text-tribe-dark-80 mx-auto mb-3 animate-pulse" />
            <p className="text-sm font-medium text-tribe-dark">{s.importing}</p>
          </div>
        )}

        {/* Step: Result */}
        {step === 'result' &&
          result &&
          (() => {
            const errorCount = result.errors.length;
            const totalSuccess = result.inserted + result.updated;
            const dupes = result.already_existed;
            const isAllErrors = totalSuccess === 0 && dupes === 0 && errorCount > 0;
            const hasErrors = errorCount > 0;
            const isAllDups = totalSuccess === 0 && dupes > 0 && errorCount === 0;

            const resultTitle = isAllErrors
              ? s.resultTitleFailed
              : hasErrors
                ? s.resultTitlePartial
                : isAllDups
                  ? s.resultTitleAllDups
                  : s.resultTitle;

            const Icon = isAllErrors ? AlertTriangle : hasErrors ? AlertTriangle : CheckCircle2;
            const iconColor = isAllErrors ? 'text-red-600' : hasErrors ? 'text-yellow-600' : 'text-green-600';

            const summaryMessage = isAllDups
              ? s.allDupsMessage.replace('{count}', String(dupes))
              : dupes > 0 && result.inserted > 0
                ? s.newAndDupsMessage.replace('{inserted}', String(result.inserted)).replace('{dupes}', String(dupes))
                : null;

            return (
              <section className="space-y-4">
                <div className="flex items-center gap-2">
                  <Icon className={`h-6 w-6 ${iconColor}`} />
                  <h2 className="text-lg font-bold text-tribe-dark">{resultTitle}</h2>
                </div>
                {summaryMessage && <p className="text-sm text-tribe-dark-80">{summaryMessage}</p>}
                <div
                  className={`grid gap-4 ${tab === 'visits' ? (errorCount > 0 ? 'grid-cols-3' : dupes > 0 ? 'grid-cols-2' : 'grid-cols-1') : 'grid-cols-3'}`}
                >
                  <div className="bg-green-50 rounded-tribe p-4 text-center">
                    <p className="text-2xl font-bold text-green-700">{result.inserted}</p>
                    <p className="text-xs text-green-600">{s.inserted}</p>
                  </div>
                  {tab === 'members' && (
                    <div className="bg-blue-50 rounded-tribe p-4 text-center">
                      <p className="text-2xl font-bold text-blue-700">{result.updated}</p>
                      <p className="text-xs text-blue-600">{s.updated}</p>
                    </div>
                  )}
                  {tab === 'visits' && dupes > 0 && (
                    <div className="bg-gray-50 rounded-tribe p-4 text-center">
                      <p className="text-2xl font-bold text-gray-600">{dupes}</p>
                      <p className="text-xs text-gray-500">{s.alreadyExisted}</p>
                    </div>
                  )}
                  {errorCount > 0 && (
                    <div className="bg-red-50 rounded-tribe p-4 text-center">
                      <p className="text-2xl font-bold text-red-700">{errorCount}</p>
                      <p className="text-xs text-red-600">{s.skipped}</p>
                    </div>
                  )}
                  {tab === 'members' && errorCount === 0 && (
                    <div className="bg-red-50 rounded-tribe p-4 text-center">
                      <p className="text-2xl font-bold text-red-700">0</p>
                      <p className="text-xs text-red-600">{s.skipped}</p>
                    </div>
                  )}
                </div>
                {errorCount > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-red-500" />
                      <span className="text-sm font-medium text-tribe-dark">
                        {errorCount} {s.errorRow}
                        {errorCount > 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="max-h-40 overflow-y-auto text-xs bg-gray-50 rounded-tribe p-3 space-y-1">
                      {result.errors.slice(0, 20).map((e, i) => (
                        <p key={i} className="text-tribe-dark-80">
                          {s.errorRow} {e.row}: {humanizeImportError(e.error, language)}
                        </p>
                      ))}
                      {result.errors.length > 20 && (
                        <p className="text-tribe-dark-80">…+{result.errors.length - 20} more</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        downloadCsv(
                          result.errors.map((e) => ({ row: e.row, error: e.error, ...e.data })),
                          `import-errors-${Date.now()}.csv`
                        )
                      }
                      className="flex items-center gap-1 text-xs text-tribe-green-dark hover:underline"
                    >
                      <Download className="h-3.5 w-3.5" />
                      {s.downloadErrors}
                    </button>
                  </div>
                )}
                <Button size="sm" variant="secondary" onClick={resetFlow}>
                  {s.importAnother}
                </Button>
              </section>
            );
          })()}
      </div>
    </div>
  );
}
