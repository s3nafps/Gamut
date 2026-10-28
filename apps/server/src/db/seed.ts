import type { LocalizedName } from '@gamut/core';
import { hashPin } from '../auth';
import type { Db } from './client';
import * as s from './schema';

const n = (en: string, fr: string, ar: string): LocalizedName => ({ en, fr, ar });

export const DEFAULT_SETTINGS: Record<string, unknown> = {
  fpyTarget: 95,
  maxRetestFails: 3,
  idleLockMinutes: 5,
};

const WM_COMPONENTS: LocalizedName[] = [
  n('Door lock', 'Serrure de porte', 'قفل الباب'),
  n('Door seal', 'Joint de hublot', 'حشية الباب'),
  n('Door hinge', 'Charnière de porte', 'مفصلة الباب'),
  n('Drum', 'Tambour', 'الحوض الداخلي'),
  n('Tub', 'Cuve', 'الحوض الخارجي'),
  n('Bearings & seal', 'Roulements et joint', 'رولمان البلي والحشية'),
  n('Drive belt', 'Courroie', 'السير'),
  n('Motor', 'Moteur', 'المحرك'),
  n('Carbon brushes', 'Charbons', 'الفحمات'),
  n('Tacho sensor', 'Capteur tachymétrique', 'حساس السرعة'),
  n('Drain pump', 'Pompe de vidange', 'مضخة التصريف'),
  n('Inlet valve', 'Électrovanne', 'صمام دخول الماء'),
  n('Pressure switch', 'Pressostat', 'حساس مستوى الماء'),
  n('Heater', 'Résistance', 'السخان'),
  n('Temperature sensor (NTC)', 'Sonde de température (CTN)', 'حساس الحرارة'),
  n('Main PCB', 'Carte électronique', 'اللوحة الإلكترونية الرئيسية'),
  n('Display / UI board', "Carte d'affichage", 'لوحة العرض والأزرار'),
  n('Wiring harness', 'Faisceau électrique', 'ضفيرة الأسلاك'),
  n('Shock absorbers', 'Amortisseurs', 'ممتصات الصدمات'),
  n('Springs', 'Ressorts', 'النوابض'),
  n('Counterweight', 'Contrepoids', 'الثقل الموازن'),
  n('Detergent drawer', 'Bac à produits', 'درج المسحوق'),
  n('Filter', 'Filtre', 'الفلتر'),
  n('Hoses', 'Tuyaux', 'الخراطيم'),
  n('Power cord', "Cordon d'alimentation", 'سلك الكهرباء'),
  n('Cabinet / panels', 'Carrosserie / panneaux', 'الهيكل والألواح'),
];

const WM_DEFECTS: Array<[string, LocalizedName]> = [
  ['WM-DL01', n('Door does not lock', 'La porte ne se verrouille pas', 'الباب لا يُقفل')],
  ['WM-DR01', n('Does not drain', 'Ne vidange pas', 'لا يصرّف الماء')],
  ['WM-IN01', n('Does not fill', 'Ne se remplit pas', 'لا يمتلئ بالماء')],
  ['WM-LK01', n('Water leak', "Fuite d'eau", 'تسرّب الماء')],
  ['WM-HT01', n('Not heating', 'Ne chauffe pas', 'لا يسخّن')],
  ['WM-MT01', n('Drum does not turn', 'Le tambour ne tourne pas', 'الحوض لا يدور')],
  ['WM-SP01', n('Does not spin', "N'essore pas", 'لا يعصر')],
  ['WM-NV01', n('Noise / vibration', 'Bruit / vibration', 'ضجيج / اهتزاز')],
  ['WM-EL01', n('No power', "Pas d'alimentation", 'لا يشتغل')],
  ['WM-EL02', n('Electrical safety fail', 'Défaut sécurité électrique', 'فشل اختبار السلامة الكهربائية')],
  ['WM-UI01', n('Display / buttons fault', 'Défaut afficheur / boutons', 'عطل في الشاشة / الأزرار')],
  ['WM-ER01', n('Error code shown', "Code d'erreur affiché", 'ظهور رمز عطل')],
  ['WM-CS01', n('Cosmetic damage', "Défaut d'aspect", 'عيب في المظهر')],
  ['WM-OT99', n('Other', 'Autre', 'أخرى')],
];

const WM_CHECKLIST: Array<{ name: LocalizedName; kind?: 'ok' | 'measure'; min?: number; max?: number; unit?: string }> = [
  { name: n('Power on', 'Mise sous tension', 'التشغيل') },
  { name: n('Door lock / unlock', 'Verrouillage / déverrouillage porte', 'قفل وفتح الباب') },
  { name: n('Water fill', 'Remplissage', 'ملء الماء') },
  { name: n('Heating', 'Chauffe', 'التسخين') },
  { name: n('Rotation both directions', 'Rotation dans les deux sens', 'الدوران في الاتجاهين') },
  { name: n('Drain', 'Vidange', 'التصريف') },
  { name: n('Spin at max speed', 'Essorage vitesse max', 'العصر بالسرعة القصوى') },
  { name: n('Noise / vibration', 'Bruit / vibrations', 'الضجيج والاهتزاز') },
  { name: n('No leaks', 'Pas de fuite', 'عدم وجود تسرّب') },
  { name: n('No error codes', "Aucun code d'erreur", 'لا توجد رموز أعطال') },
  { name: n('Visual / cosmetic', 'Aspect visuel', 'الفحص البصري') },
  { name: n('Leakage current', 'Courant de fuite', 'تيار التسرّب'), kind: 'measure', min: 0, max: 3.5, unit: 'mA' },
];

const ACTION_TYPES: LocalizedName[] = [
  n('Replaced', 'Remplacé', 'تم الاستبدال'),
  n('Repaired', 'Réparé', 'تم الإصلاح'),
  n('Adjusted', 'Réglé', 'تم الضبط'),
  n('Cleaned', 'Nettoyé', 'تم التنظيف'),
  n('Re-wired / reconnected', 'Recâblé / reconnecté', 'إعادة التوصيل'),
  n('Tightened', 'Resserré', 'تم الشد'),
  n('Software reflash', 'Reprogrammé', 'إعادة البرمجة'),
  n('Inspected only', 'Contrôlé seulement', 'فحص فقط'),
];

/**
 * Fills an empty database.
 * Always: settings, admin account, stations, action types, and the washing machine
 * category with its components, defect codes and checklist (all editable later).
 * demo = true: also example models, colors, a serial rule and test users.
 */
export async function seedIfEmpty(db: Db, opts: { demo: boolean }): Promise<boolean> {
  const existing = await db.select({ id: s.users.id }).from(s.users).limit(1);
  if (existing.length > 0) return false;

  await db.transaction(async (tx) => {
    await tx.insert(s.settings).values(Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({ key, value })));

    await tx.insert(s.users).values({
      employeeId: 'admin',
      fullName: 'Administrator',
      roles: ['admin'],
      language: 'fr',
      pinHash: hashPin('1234'),
    });

    await tx.insert(s.stations).values([
      { name: 'Test room', type: 'quality' },
      { name: 'Repair 1', type: 'repair' },
      { name: 'Repair 2', type: 'repair' },
      { name: 'Line dashboard', type: 'display' },
    ]);

    await tx.insert(s.actionTypes).values(ACTION_TYPES.map((name) => ({ name })));

    const [wm] = await tx
      .insert(s.categories)
      .values({ code: 'WM', name: n('Washing machine', 'Lave-linge', 'غسالة الملابس') })
      .returning();

    await tx.insert(s.components).values(WM_COMPONENTS.map((name) => ({ categoryId: wm.id, name })));
    await tx.insert(s.defectCodes).values(WM_DEFECTS.map(([code, name]) => ({ categoryId: wm.id, code, name })));
    await tx.insert(s.checklistItems).values(
      WM_CHECKLIST.map((c, i) => ({
        categoryId: wm.id,
        name: c.name,
        kind: c.kind ?? 'ok',
        min: c.min ?? null,
        max: c.max ?? null,
        unit: c.unit ?? '',
        sort: (i + 1) * 10,
      })),
    );

    if (!opts.demo) return;

    await tx.insert(s.colors).values([
      { code: 'W', name: n('White', 'Blanc', 'أبيض') },
      { code: 'S', name: n('Silver', 'Gris argent', 'فضي') },
      { code: 'B', name: n('Black', 'Noir', 'أسود') },
    ]);
    await tx.insert(s.models).values([
      { categoryId: wm.id, code: 'WM7T', name: '7 kg top-load', brand: 'Demo', attributes: { capacity: '7 kg', load: 'Top' } },
      { categoryId: wm.id, code: 'WM8F', name: '8 kg front-load 1200 rpm', brand: 'Demo', attributes: { capacity: '8 kg', load: 'Front' } },
      { categoryId: wm.id, code: 'WM9F', name: '9 kg front-load inverter 1400 rpm', brand: 'Demo', attributes: { capacity: '9 kg', load: 'Front' } },
    ]);
    await tx.insert(s.serialRules).values({
      categoryId: wm.id,
      label: 'Example — replace with the real format',
      pattern: '^(?<model>WM[0-9][A-Z])(?<color>[A-Z])(?<year>\\d{2})(?<month>\\d{2})\\d{6}$',
      example: 'WM8FW2610000123',
    });
    const comps = await tx.select().from(s.components);
    const comp = (en: string) => comps.find((c) => c.name.en === en)?.id ?? null;
    await tx.insert(s.parts).values([
      { partNumber: '41000101', name: n('Door seal 8 kg', 'Joint de hublot 8 kg', 'حشية الباب 8 كغ'), categoryId: wm.id, componentId: comp('Door seal'), stockQty: 12, minStock: 5 },
      { partNumber: '41000202', name: n('Drain pump 30 W', 'Pompe de vidange 30 W', 'مضخة تصريف 30 واط'), categoryId: wm.id, componentId: comp('Drain pump'), stockQty: 4, minStock: 5 },
      { partNumber: '41000303', name: n('Door lock', 'Serrure de porte', 'قفل الباب'), categoryId: wm.id, componentId: comp('Door lock'), stockQty: 20, minStock: 6 },
      { partNumber: '41000404', name: n('Drive belt 1270 J5', 'Courroie 1270 J5', 'سير 1270 J5'), categoryId: wm.id, componentId: comp('Drive belt'), stockQty: 15, minStock: 4 },
      { partNumber: '41000505', name: n('Heater 2000 W', 'Résistance 2000 W', 'سخان 2000 واط'), categoryId: wm.id, componentId: comp('Heater'), stockQty: 8, minStock: 3 },
      { partNumber: '41000606', name: n('Bearing kit 6204/6205', 'Kit roulements 6204/6205', 'طقم رولمان 6204/6205'), categoryId: wm.id, componentId: comp('Bearings & seal'), stockQty: 6, minStock: 2 },
    ]);
    await tx.insert(s.users).values([
      { employeeId: 'T001', fullName: 'Tester 1', roles: ['tester'], language: 'fr', pinHash: hashPin('1357') },
      { employeeId: 'R001', fullName: 'Repairman 1', roles: ['repairman'], language: 'ar', pinHash: hashPin('2468') },
      { employeeId: 'R002', fullName: 'Repairman 2', roles: ['repairman'], language: 'fr', pinHash: hashPin('3579') },
      { employeeId: 'S001', fullName: 'Supervisor 1', roles: ['supervisor'], language: 'en', pinHash: hashPin('4680') },
    ]);
  });
  return true;
}
