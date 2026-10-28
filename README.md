# Gamut Repair

Repair and quality tracking for a home-appliance factory — a desktop app on
several PCs, connected to one central server inside the factory.

Every unit is scanned and tested in the **test room**. If it passes, it goes
through. If it fails, a **repairman** fixes it and it goes back to the test room.
The app records every test, every repair, who did it, and the full history of
each unit.

- Three interfaces: **quality (test room)**, **repairman**, **production line dashboard**
  (+ supervisor search and admin settings)
- Three languages: **French, Arabic (right-to-left), English**
- Products are **added manually** (they are not in the ERP); model and color are read from the
  serial number once its format is set up
- Starts with **washing machines**; other product types are added from Settings, no code change
- Photos of defects, spare parts with stock and low-stock alerts, QR repair tags
- Reports with Excel export and print / PDF, change log, editable screen texts, in-app help
- Windows installer for the PCs, built automatically on GitHub (Actions → *Desktop installer*)

**Get started:** [docs/SETUP.md](docs/SETUP.md) · **Training guides:** [FR](docs/guide/fr.md) · [AR](docs/guide/ar.md) · [EN](docs/guide/en.md) · **Full plan:** [docs/PLAN.md](docs/PLAN.md)

```bash
npm ci
npm run dev:server   # terminal 1 — server + built-in database with demo data
npm run dev:web      # terminal 2 — open http://localhost:5173
```
