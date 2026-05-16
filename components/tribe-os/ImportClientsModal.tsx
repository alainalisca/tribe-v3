'use client';

/**
 * ImportClientsModal — bulk-add clients from a CSV file.
 *
 * The biggest practical onboarding pain for a new gym owner is
 * retyping their spreadsheet roster client-by-client. This modal
 * accepts a CSV (drag-drop or file picker), parses it client-side
 * so the user can see + fix issues before anything hits the
 * database, then POSTs the validated rows to
 * /api/tribe-os/clients/import for a single bulk insert.
 *
 * Flow:
 *   1. Pick a file (or drag one in)
 *   2. We parse it locally, show a preview table with per-row
 *      validation status and a sample of unknown columns
 *   3. User clicks Import → POST → show result summary
 *
 * Errors at each stage stay scoped: a row that fails Zod
 * validation server-side is reported back with its row number, the
 * UI lists it alongside the create count. Whole-batch failures
 * (rare — usually only triggered by a DB CHECK constraint nobody
 * predicted) show a generic retry message and keep the parsed
 * preview intact so the user doesn't have to re-pick the file.
 *
 * Spanish copy is pending Verónica's review.
 */

import { useCallback, useRef, useState } from 'react';
import { Upload, X as XIcon, CheckCircle2, AlertCircle, FileText, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/tribe-os/ui';
import { useLanguage } from '@/lib/LanguageContext';
import { trackEvent } from '@/lib/analytics';
import { parseClientsCSV, type ParseResult, type ParseRowError } from '@/lib/csv/parseClientsCSV';

const PREVIEW_ROW_CAP = 10;

interface ImportClientsModalProps {
  onClose: () => void;
  /** Fires after a successful import so the parent can refresh its list. */
  onImported: (createdCount: number) => void;
}

type Stage =
  | { kind: 'pick' }
  | { kind: 'preview'; parse: ParseResult; fileName: string }
  | { kind: 'importing'; parse: ParseResult; fileName: string }
  | {
      kind: 'result';
      fileName: string;
      created: number;
      skipped: number;
      errors: Array<{ rowNumber: number; message: string }>;
    }
  | { kind: 'fatal'; message: string; parse?: ParseResult; fileName?: string };

// ES PENDING VERONICA REVIEW
const copy = {
  en: {
    title: 'Import clients from CSV',
    hint: 'Upload a CSV with one row per client. We expect columns like name, email, phone, status, notes, tags.',
    pickButton: 'Choose a file',
    dropHint: 'Or drag a .csv file here.',
    templateLink: 'Download a template',
    parsing: 'Parsing…',
    importing: 'Importing…',
    cancelLabel: 'Cancel',
    backLabel: 'Back',
    importLabel: 'Import',
    doneLabel: 'Done',
    previewTitle: (validCount: number, errorCount: number) =>
      `Found ${validCount} valid ${validCount === 1 ? 'row' : 'rows'}${
        errorCount > 0 ? ` · ${errorCount} ${errorCount === 1 ? 'issue' : 'issues'}` : ''
      }`,
    previewSubtitle: (fileName: string) => `From ${fileName}`,
    previewMore: (n: number) => `+ ${n} more rows ready to import`,
    unknownHeadersHint: (cols: string[]) => `Ignored unrecognized columns: ${cols.join(', ')}.`,
    issuesTitle: 'Issues we’ll skip',
    rowLabel: (n: number) => `Row ${n}`,
    resultTitleSuccess: (n: number) => (n === 1 ? '1 client imported.' : `${n} clients imported.`),
    resultTitleAllSkipped: 'Nothing imported.',
    resultSkipped: (n: number) => (n === 1 ? '1 row skipped (see below).' : `${n} rows skipped (see below).`),
    fatalGeneric:
      'Something went wrong on the server. Your file wasn’t imported. Check for a duplicate email or invalid status value, then try again.',
    fatalNoRows: 'No usable rows. Check your file’s headers and that at least one row has a name.',
    pickButtonAria: 'Choose a CSV file',
    statusValid: 'OK',
    statusInvalid: 'Issue',
    columnName: 'Name',
    columnEmail: 'Email',
    columnPhone: 'Phone',
    columnStatus: 'Status',
    columnTags: 'Tags',
    closeAria: 'Close',
  },
  es: {
    title: 'Importar clientes desde CSV',
    hint: 'Sube un CSV con una fila por cliente. Esperamos columnas como name, email, phone, status, notes, tags.',
    pickButton: 'Elegir archivo',
    dropHint: 'O arrastra un .csv aquí.',
    templateLink: 'Descargar plantilla',
    parsing: 'Procesando…',
    importing: 'Importando…',
    cancelLabel: 'Cancelar',
    backLabel: 'Volver',
    importLabel: 'Importar',
    doneLabel: 'Listo',
    previewTitle: (validCount: number, errorCount: number) =>
      `${validCount} ${validCount === 1 ? 'fila válida' : 'filas válidas'}${
        errorCount > 0 ? ` · ${errorCount} ${errorCount === 1 ? 'problema' : 'problemas'}` : ''
      }`,
    previewSubtitle: (fileName: string) => `Desde ${fileName}`,
    previewMore: (n: number) => `+ ${n} filas más listas para importar`,
    unknownHeadersHint: (cols: string[]) => `Columnas no reconocidas ignoradas: ${cols.join(', ')}.`,
    issuesTitle: 'Filas que omitiremos',
    rowLabel: (n: number) => `Fila ${n}`,
    resultTitleSuccess: (n: number) => (n === 1 ? '1 cliente importado.' : `${n} clientes importados.`),
    resultTitleAllSkipped: 'Nada importado.',
    resultSkipped: (n: number) => (n === 1 ? '1 fila omitida (ver abajo).' : `${n} filas omitidas (ver abajo).`),
    fatalGeneric:
      'Algo falló en el servidor. Tu archivo no se importó. Revisa que no haya correos duplicados o estados inválidos e intenta de nuevo.',
    fatalNoRows: 'No hay filas utilizables. Revisa los encabezados y que al menos una fila tenga nombre.',
    pickButtonAria: 'Elegir archivo CSV',
    statusValid: 'OK',
    statusInvalid: 'Problema',
    columnName: 'Nombre',
    columnEmail: 'Correo',
    columnPhone: 'Teléfono',
    columnStatus: 'Estado',
    columnTags: 'Etiquetas',
    closeAria: 'Cerrar',
  },
} as const;

/** Tiny CSV template the user can download as a starting point. */
const TEMPLATE_CSV = `name,email,phone,status,notes,tags
Anna Garcia,anna@example.com,+57 300 123 4567,active,Loves Tuesday CrossFit,vip;tuesday
Carlos Lopez,,+57 311 987 6543,lead,Trial member,trial
`;

export default function ImportClientsModal({ onClose, onImported }: ImportClientsModalProps) {
  const { language } = useLanguage();
  const s = copy[language];
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [stage, setStage] = useState<Stage>({ kind: 'pick' });
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback(
    async (file: File) => {
      try {
        const text = await file.text();
        const parse = parseClientsCSV(text);
        // Nothing to import + only global errors → show fatal so the
        // user understands the file's missing the name column or is
        // otherwise unusable. Per-row errors with at least one valid
        // row stay in 'preview' so the user can proceed with the good
        // rows.
        if (parse.rows.length === 0) {
          setStage({
            kind: 'fatal',
            message:
              parse.errors[0]?.message && parse.errors[0]?.rowNumber === 0 ? parse.errors[0].message : s.fatalNoRows,
            parse,
            fileName: file.name,
          });
          return;
        }
        setStage({ kind: 'preview', parse, fileName: file.name });
        trackEvent('tribe_os_client_import_previewed', {
          row_count: parse.rows.length,
          error_count: parse.errors.length,
        });
      } catch {
        setStage({ kind: 'fatal', message: s.fatalGeneric });
      }
    },
    [s.fatalGeneric, s.fatalNoRows]
  );

  function handlePick() {
    fileInputRef.current?.click();
  }

  async function handleImport() {
    if (stage.kind !== 'preview') return;
    const previewState = stage;
    setStage({ kind: 'importing', parse: previewState.parse, fileName: previewState.fileName });
    try {
      const res = await fetch('/api/tribe-os/clients/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: previewState.parse.rows }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        data?: { created: number; skipped: number; errors: Array<{ rowNumber: number; message: string }> };
        error?: string;
      };
      if (!res.ok || !body.success || !body.data) {
        setStage({
          kind: 'fatal',
          message: body.error || s.fatalGeneric,
          parse: previewState.parse,
          fileName: previewState.fileName,
        });
        return;
      }
      // Combine server-side errors with parse-time errors so the
      // result screen shows every row that didn't make it.
      const allErrors = [
        ...previewState.parse.errors.map((e) => ({ rowNumber: e.rowNumber, message: e.message })),
        ...body.data.errors,
      ];
      setStage({
        kind: 'result',
        fileName: previewState.fileName,
        created: body.data.created,
        skipped: body.data.skipped + previewState.parse.errors.length,
        errors: allErrors,
      });
      trackEvent('tribe_os_client_import_completed', {
        created: body.data.created,
        skipped: body.data.skipped + previewState.parse.errors.length,
      });
      if (body.data.created > 0) onImported(body.data.created);
    } catch {
      setStage({
        kind: 'fatal',
        message: s.fatalGeneric,
        parse: previewState.parse,
        fileName: previewState.fileName,
      });
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  }

  function handleTemplateDownload(e: React.MouseEvent<HTMLAnchorElement>) {
    e.preventDefault();
    const blob = new Blob([TEMPLATE_CSV], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tribe-clients-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Dialog open={true} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl rounded-tribe p-5 bg-white border border-tribe-dark-40 text-tribe-dark">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <DialogTitle className="text-base font-bold text-tribe-dark">{s.title}</DialogTitle>
            <p className="text-xs text-tribe-dark-80 mt-1 leading-relaxed">{s.hint}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={s.closeAria}
            className="p-1 -m-1 text-tribe-dark-80 hover:text-tribe-dark"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        {stage.kind === 'pick' ? (
          <PickStage
            s={s}
            dragOver={dragOver}
            setDragOver={setDragOver}
            onPick={handlePick}
            onDrop={handleDrop}
            onTemplate={handleTemplateDownload}
          />
        ) : stage.kind === 'preview' || stage.kind === 'importing' ? (
          <PreviewStage
            s={s}
            parse={stage.parse}
            fileName={stage.fileName}
            importing={stage.kind === 'importing'}
            onCancel={onClose}
            onImport={handleImport}
            onBack={() => setStage({ kind: 'pick' })}
          />
        ) : stage.kind === 'result' ? (
          <ResultStage s={s} stage={stage} onClose={onClose} />
        ) : (
          <FatalStage s={s} message={stage.message} onClose={onClose} onBack={() => setStage({ kind: 'pick' })} />
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          aria-label={s.pickButtonAria}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
            // Reset so picking the same file twice still fires onChange.
            e.target.value = '';
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function PickStage({
  s,
  dragOver,
  setDragOver,
  onPick,
  onDrop,
  onTemplate,
}: {
  s: typeof copy.en | typeof copy.es;
  dragOver: boolean;
  setDragOver: (v: boolean) => void;
  onPick: () => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onTemplate: (e: React.MouseEvent<HTMLAnchorElement>) => void;
}) {
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      className={`mt-4 mb-3 rounded-tribe border-2 border-dashed px-6 py-10 text-center transition-colors ${
        dragOver ? 'border-tribe-green bg-tribe-green-50/40' : 'border-tribe-dark-40 bg-tribe-dark-40/30'
      }`}
    >
      <Upload className="w-8 h-8 mx-auto text-tribe-dark-60 mb-2" aria-hidden="true" />
      <Button onClick={onPick} type="button">
        {s.pickButton}
      </Button>
      <p className="mt-2 text-xs text-tribe-dark-80">{s.dropHint}</p>
      <a
        href="#"
        onClick={onTemplate}
        className="inline-block mt-3 text-xs font-semibold text-tribe-green-dark hover:text-tribe-green underline-offset-2 hover:underline"
      >
        {s.templateLink}
      </a>
    </div>
  );
}

function PreviewStage({
  s,
  parse,
  fileName,
  importing,
  onCancel,
  onImport,
  onBack,
}: {
  s: typeof copy.en | typeof copy.es;
  parse: ParseResult;
  fileName: string;
  importing: boolean;
  onCancel: () => void;
  onImport: () => void;
  onBack: () => void;
}) {
  const previewRows = parse.rows.slice(0, PREVIEW_ROW_CAP);
  const overflow = Math.max(0, parse.rows.length - previewRows.length);

  return (
    <div className="mt-2">
      <div className="flex items-start gap-2 mb-3">
        <FileText className="w-4 h-4 text-tribe-dark-60 mt-0.5 shrink-0" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-tribe-dark truncate">{fileName}</p>
          <p className="text-xs text-tribe-dark-80">{s.previewTitle(parse.rows.length, parse.errors.length)}</p>
        </div>
      </div>

      {parse.unknownHeaders.length > 0 ? (
        <div className="mb-3 px-3 py-2 rounded-tribe bg-tribe-info/10 border border-tribe-info/30 text-xs text-tribe-dark-80">
          {s.unknownHeadersHint(parse.unknownHeaders)}
        </div>
      ) : null}

      {/* Preview table — first N valid rows */}
      <div className="overflow-x-auto rounded-tribe border border-tribe-dark-40 mb-3 max-h-72 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="bg-tribe-dark-40/40 sticky top-0">
            <tr>
              <th className="px-2 py-1.5 text-left font-semibold text-tribe-dark-60 w-10">#</th>
              <th className="px-2 py-1.5 text-left font-semibold text-tribe-dark-60">{s.columnName}</th>
              <th className="px-2 py-1.5 text-left font-semibold text-tribe-dark-60">{s.columnEmail}</th>
              <th className="px-2 py-1.5 text-left font-semibold text-tribe-dark-60">{s.columnPhone}</th>
              <th className="px-2 py-1.5 text-left font-semibold text-tribe-dark-60">{s.columnStatus}</th>
              <th className="px-2 py-1.5 text-left font-semibold text-tribe-dark-60">{s.columnTags}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-tribe-dark-40">
            {previewRows.map((row) => (
              <tr key={row.rowNumber}>
                <td className="px-2 py-1.5 text-tribe-dark-60">{row.rowNumber}</td>
                <td className="px-2 py-1.5 text-tribe-dark font-medium truncate">{row.name}</td>
                <td className="px-2 py-1.5 text-tribe-dark-80 truncate">{row.email ?? '—'}</td>
                <td className="px-2 py-1.5 text-tribe-dark-80 truncate">{row.phone ?? '—'}</td>
                <td className="px-2 py-1.5 text-tribe-dark-80">{row.status ?? '—'}</td>
                <td className="px-2 py-1.5 text-tribe-dark-80 truncate">{row.tags.join(', ') || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {overflow > 0 ? <p className="text-xs text-tribe-dark-60 mb-3 text-center">{s.previewMore(overflow)}</p> : null}

      {parse.errors.length > 0 ? (
        <div className="mb-3">
          <p className="text-xs font-semibold text-tribe-dark mb-1.5 flex items-center gap-1">
            <AlertCircle className="w-3 h-3 text-tribe-warning" />
            {s.issuesTitle}
          </p>
          <ul className="space-y-1 max-h-32 overflow-y-auto">
            {parse.errors.slice(0, 20).map((err: ParseRowError, idx) => (
              <li key={`${err.rowNumber}-${idx}`} className="text-xs text-tribe-dark-80">
                <span className="font-semibold text-tribe-dark">{s.rowLabel(err.rowNumber)}:</span> {err.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" type="button" onClick={onBack} disabled={importing}>
          {s.backLabel}
        </Button>
        <Button variant="secondary" type="button" onClick={onCancel} disabled={importing}>
          {s.cancelLabel}
        </Button>
        <Button type="button" onClick={onImport} disabled={importing || parse.rows.length === 0}>
          {importing ? (
            <>
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              {s.importing}
            </>
          ) : (
            s.importLabel
          )}
        </Button>
      </div>
    </div>
  );
}

function ResultStage({
  s,
  stage,
  onClose,
}: {
  s: typeof copy.en | typeof copy.es;
  stage: Extract<Stage, { kind: 'result' }>;
  onClose: () => void;
}) {
  return (
    <div className="mt-4">
      <div className="text-center py-4">
        {stage.created > 0 ? (
          <CheckCircle2 className="w-10 h-10 text-tribe-green-dark mx-auto mb-2" aria-hidden="true" />
        ) : (
          <AlertCircle className="w-10 h-10 text-tribe-warning mx-auto mb-2" aria-hidden="true" />
        )}
        <p className="text-base font-semibold text-tribe-dark">
          {stage.created > 0 ? s.resultTitleSuccess(stage.created) : s.resultTitleAllSkipped}
        </p>
        {stage.skipped > 0 ? <p className="text-xs text-tribe-dark-80 mt-1">{s.resultSkipped(stage.skipped)}</p> : null}
      </div>

      {stage.errors.length > 0 ? (
        <div className="mb-4">
          <p className="text-xs font-semibold text-tribe-dark mb-1.5 flex items-center gap-1">
            <AlertCircle className="w-3 h-3 text-tribe-warning" />
            {s.issuesTitle}
          </p>
          <ul className="space-y-1 max-h-48 overflow-y-auto">
            {stage.errors.slice(0, 50).map((err, idx) => (
              <li key={`${err.rowNumber}-${idx}`} className="text-xs text-tribe-dark-80">
                <span className="font-semibold text-tribe-dark">{s.rowLabel(err.rowNumber)}:</span> {err.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex justify-end pt-2">
        <Button type="button" onClick={onClose}>
          {s.doneLabel}
        </Button>
      </div>
    </div>
  );
}

function FatalStage({
  s,
  message,
  onClose,
  onBack,
}: {
  s: typeof copy.en | typeof copy.es;
  message: string;
  onClose: () => void;
  onBack: () => void;
}) {
  return (
    <div className="mt-4">
      <div className="text-center py-4">
        <AlertCircle className="w-10 h-10 text-tribe-danger mx-auto mb-2" aria-hidden="true" />
        <p className="text-sm text-tribe-dark leading-relaxed max-w-md mx-auto">{message}</p>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" type="button" onClick={onBack}>
          {s.backLabel}
        </Button>
        <Button type="button" onClick={onClose}>
          {s.doneLabel}
        </Button>
      </div>
    </div>
  );
}
