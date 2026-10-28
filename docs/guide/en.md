# Gamut Repair — Training guide

*Print the page for your station and put it next to the PC. The same help is in the app: user menu → **Help**.*

---

## 1. Test room (quality tester)

1. Sign in: **employee ID** (or scan your badge), then **PIN**.
2. **Scan the serial number** of the unit. Model and color appear by themselves.
   If they don't, pick them from the list.
3. Test the unit. Press **✗** for every check that fails. For measurements (e.g. leakage current),
   type the value: it turns red when it is out of limits.
4. **All good** → press **PASS**. The unit goes on.
5. **Problem** → press **FAIL**:
   - choose the **defect** from the list,
   - add a **note** and **photos** if useful,
   - press **Send to repair**.
6. Press **Print repair tag**, stick it on the unit, and send the unit to repair.
7. Repaired units appear under **Coming back from repair** (right side). Scan them and test them **again**.

**Good to know**
- A unit still in repair cannot be tested: the screen tells you.
- You cannot pass a unit you repaired yourself.
- Made a mistake? Tell your supervisor. Nothing is erased; everything can be corrected.

---

## 2. Repair (repairman)

1. Sign in. At the top, **in red**: units that **failed again** in the test room. Do them first.
2. **Waiting for a repairman**: press **Take it** (or scan the tag / serial number).
3. Read **what the test room found**: defect, failed checks, note, photos.
4. **Fault found**: choose the actual fault → **Save fault**.
5. **What did you do?** For each repair:
   - the **part of the machine** (e.g. drain pump) and the **action** (replaced, adjusted, cleaned…),
   - the **spare parts from stock** you used (stock goes down by itself),
   - the **time spent** → **Save repair**.
6. No spare part? **Waiting for parts**, then **Parts arrived — resume**.
7. Done → **Send back to test room**. Only the test room can pass the unit.

---

## 3. Supervisor

- **Repair**: all open repairs; **Give to…** to hand a repair to someone else. A **red alert** = a unit
  failed the retest too many times: decide (repair or scrap).
- **Reports**: first-pass yield, defects (Pareto), repair times, repairmen, testers.
  **Export to Excel** or **Print / PDF**.
- **Spare parts**: record **deliveries** and **inventory counts**; watch **low stock**.
- **Units**: search a serial number → full history, print, scrap.
- **Change log** (user menu): who did what and when.
- **Line dashboard**: the production line's big screen.

---

## 4. Admin

1. **First**: user menu → **Change my PIN** (the original 1234 is refused afterwards).
2. **Settings → People**: add every person (employee ID, name, role, language, PIN).
3. **Models** and **Colors**: add your products with their **code in the serial number**.
4. **Serial number**: set the rule and test it with a real serial.
5. Check **Defect codes**, **Test checklist**, **Machine parts**, **Repair actions**,
   **Spare parts** (with minimum stock) and their translations.
6. **Screen texts**: change any wording in the three languages.
7. **General**: yield target, alert after N failed retests, automatic sign-out.

Nothing is ever deleted: to stop using something, switch off **Active**.
