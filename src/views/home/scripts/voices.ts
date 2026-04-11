export function voiceLogic(): string {
    return `
// ─── Voice Management ───────────────────────────────────────────────────────────

function renderVoices() {
    voiceSelect.innerHTML = '<option value="">Select Voice</option>';
    const selectedLang = (langSelect.value || '').toLowerCase();
    let results = 0;
    
    if (!Object.keys(allVoices).length) {
        voiceHint.textContent = 'Using the built-in voice list. Dynamic voices were not loaded yet.';
        return;
    }

    Object.entries(allVoices)
        .sort(([langA], [langB]) => (localeNames[langA] || langA).localeCompare(localeNames[langB] || langB))
        .forEach(([lang, voices]) => {
            const friendlyLang = (localeNames[lang] || lang).toLowerCase();
            
            // Filter by language if one is selected
            if (selectedLang) {
                const isMatch = lang.toLowerCase() === selectedLang || 
                                lang.toLowerCase().startsWith(selectedLang.slice(0, 2)) ||
                                friendlyLang.includes(selectedLang);
                if (!isMatch) return;
            }

            const filtered = voices;
            if (filtered.length > 0) {
                const group = document.createElement('optgroup');
                group.label = friendlyLang;
                filtered.forEach((v) => {
                    const opt = document.createElement('option');
                    opt.value = v.name;
                    opt.textContent = \`\${v.name} (\${v.gender})\`;
                    group.appendChild(opt);
                });
                voiceSelect.appendChild(group);
                results += filtered.length;
            }
        });
    voiceHint.textContent = results > 0
        ? results + ' voices available for ' + (langSelect.options[langSelect.selectedIndex].text) + '.'
        : 'No voices available for the selected language.';
}

async function loadAllVoices() {
    try {
        const res = await fetch('/api/voices');
        const json = await res.json();
        if (json.success) {
            allVoices = json.data;
            Object.keys(allVoices)
                .map(lang => ({ code: lang, name: localeNames[lang] || lang }))
                .sort((a, b) => a.name.localeCompare(b.name))
                .forEach((lang) => {
                    if (![...langSelect.options].some((o) => o.value === lang.code)) {
                        const opt = document.createElement('option');
                        opt.value = lang.code;
                        opt.textContent = lang.name;
                        langSelect.appendChild(opt);
                    }
                });
            renderVoices();
            const total = Object.values(allVoices).reduce((count, list) => count + list.length, 0);
            voiceHint.textContent = total + ' dynamic voices loaded from Edge-TTS.';
        }
    } catch (e) {
        console.error('Failed to load voices', e);
        voiceHint.textContent = 'Dynamic voice loading is unavailable right now. You can still use the built-in voice list.';
    }
}
`;
}
