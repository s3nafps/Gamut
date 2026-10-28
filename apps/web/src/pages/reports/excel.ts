import ExcelJS from 'exceljs';
import type { TFunction } from 'i18next';
import type { useNames } from '../../lib/catalog';
import type { Report } from './ReportsPage';

type Names = ReturnType<typeof useNames>;

/** Builds the report as an Excel file (one sheet per table) in the current language. */
export async function exportReportToExcel(r: Report, n: Names, t: TFunction) {
  // Dates in the factory's local time; "to" is exclusive, so the last day is to − 1 ms.
  const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const firstDay = localDay(new Date(r.from));
  const lastDay = localDay(new Date(new Date(r.to).getTime() - 1));
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Gamut Repair';
  const rtl = n.lang === 'ar';

  const sheet = (name: string, head: string[], rows: (string | number | null)[][]) => {
    const ws = wb.addWorksheet(name.slice(0, 31), { views: [{ rightToLeft: rtl, state: 'frozen', ySplit: 1 }] });
    ws.addRow(head).font = { bold: true };
    rows.forEach((row) => ws.addRow(row));
    ws.columns.forEach((c, i) => {
      const width = Math.max(head[i]?.length ?? 8, ...rows.map((row) => String(row[i] ?? '').length));
      c.width = Math.min(60, width + 2);
    });
  };
  const s = r.summary;
  const yieldRows = (rows: Report['byDay'], label: (k: number | string) => string) => rows.map((x) => [label(x.key), x.tested, x.passed, x.failed, x.fpy]);
  const yieldHead = ['', t('kpi.tested'), t('kpi.passedFirst'), t('kpi.failedFirst'), `${t('kpi.fpy')} %`];

  sheet(t('reports.summary'), [t('reports.indicator'), t('reports.value')], [
    [t('reports.from'), firstDay],
    [t('reports.to'), lastDay],
    [t('kpi.tested'), s.tested],
    [t('kpi.passedFirst'), s.passedFirst],
    [t('kpi.failedFirst'), s.failedFirst],
    [`${t('kpi.fpy')} %`, s.fpy],
    [`${t('line.target', { value: r.target })}`, r.target],
    [t('kpi.retested'), s.retests],
    [t('reports.retestFails'), s.retestFails],
    [t('kpi.repairedPassed'), s.repaired],
    [t('kpi.scrapped'), s.scrapped],
    [`${t('reports.avgRepair')} (min)`, s.avgRepairMinutes],
    [`${t('reports.avgHandsOn')} (min)`, s.avgHandsOnMinutes],
    [`${t('reports.avgWaitRetest')} (min)`, s.avgWaitRetestMinutes],
  ]);
  sheet(t('reports.byDay'), yieldHead, yieldRows(r.byDay, (k) => String(k)));
  sheet(t('reports.byModel'), yieldHead, yieldRows(r.byModel, (k) => n.model(Number(k))));
  sheet(t('reports.byColor'), yieldHead, yieldRows(r.byColor, (k) => n.color(Number(k))));
  sheet(t('reports.defects'), [t('fields.defect'), t('reports.count'), t('reports.cumulative')], r.defects.map((d) => [n.defect(d.defectCodeId), d.count, d.cumulativePct]));
  sheet(t('reports.components'), [t('fields.component'), t('fields.actionType'), t('reports.count')], r.components.map((c) => [n.component(c.componentId), n.action(c.actionTypeId), c.count]));
  sheet(t('reports.partsUsed'), [t('parts.number'), t('reports.quantity')], r.partsUsed.map((p) => [n.part(p.partId), p.quantity]));
  sheet(
    t('reports.repairmen'),
    [t('fields.fullName'), t('people.unitsRepaired'), `${t('people.repairTime')} (min)`, t('kpi.retested'), t('reports.retestFails')],
    r.repairmen.map((x) => [n.user(x.userId), x.units, x.minutes, x.retests, x.retestFails]),
  );
  sheet(t('reports.testers'), [t('fields.fullName'), t('people.unitsTested'), t('people.failsFound')], r.testers.map((x) => [n.user(x.userId), x.tests, x.fails]));
  sheet(t('reports.repeat'), [t('fields.serial'), t('fields.model'), t('units.repairs')], r.repeatUnits.map((u) => [u.serial, n.model(u.modelId), u.repairs]));
  sheet(
    t('kpi.scrapped'),
    [t('fields.serial'), t('fields.model'), t('repair.scrapReason'), t('reports.by'), t('reports.date')],
    r.scrapped.map((x) => [x.serial, n.model(x.modelId), x.reason, n.user(x.userId), `${localDay(new Date(x.at))} ${new Date(x.at).toTimeString().slice(0, 5)}`]),
  );

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `gamut-report-${firstDay}_${lastDay}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}
