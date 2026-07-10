## Contributing

Thanks for helping! This project is MIT and welcomes contributions.

### Good first issues
See [GOOD_FIRST_ISSUES.md](GOOD_FIRST_ISSUES.md) for scoped, low-risk tasks.

### Dev setup (all platforms)
```bash
git clone https://github.com/itsPremkumar/Automated-Video-Generator.git
cd Automated-Video-Generator
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
npm install
npm run dev          # opens web portal at http://localhost:3001
```

### Before opening a PR
- `npm run typecheck` passes
- `npm run test:unit` passes
- `npm run lint` shows no errors (warnings are OK)

### Code style
TypeScript, ESLint (flat config). Match the surrounding code; keep it KISS/DRY.
