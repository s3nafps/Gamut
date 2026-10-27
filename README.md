# Gamut Repair

Repair and quality tracking for a home-appliance factory — a desktop app on
several PCs, connected to one central server inside the factory.

Every unit is scanned and tested in the **test room**. If it passes, it goes
through. If it fails, a **repairman** fixes it and it goes back to the test room.
The app records every test, every repair, who did it, and the full history of
each unit.

- Three interfaces: **quality (test room)**, **repairman**, **production line dashboard**
- Three languages: **French, Arabic, English**
- Products are **added manually** (they are not in the ERP)
- First appliance type: **washing machines**; others can be added later without code changes

See **[docs/PLAN.md](docs/PLAN.md)** for the full plan.
