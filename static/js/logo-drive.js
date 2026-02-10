// Logo management - Google Drive integration
// This file handles logo uploads to Google Drive via JSON settings (Serverless)

(function () {
    // Update logo upload handlers to use Drive
    function initDriveLogoHandlers() {
        // Light logo handler
        const lightInput = document.getElementById('settingsLogoLightInput');
        if (lightInput) {
            lightInput.addEventListener('change', async (e) => {
                await uploadLogoToDrive(e.target.files[0], 'light');
            });
        }

        // Dark logo handler  
        const darkInput = document.getElementById('settingsLogoDarkInput');
        if (darkInput) {
            darkInput.addEventListener('change', async (e) => {
                await uploadLogoToDrive(e.target.files[0], 'dark');
            });
        }

        // Load saved logos from settings
        loadLogosFromSettings();
    }

    async function uploadLogoToDrive(file, logoType) {
        if (!file) return;

        const preview = document.getElementById(`settingsLogo${logoType === 'light' ? 'Light' : 'Dark'}Preview`);
        const placeholder = document.getElementById(`settingsLogo${logoType === 'light' ? 'Light' : 'Dark'}Placeholder`);

        try {
            if (placeholder) {
                placeholder.textContent = 'Subiendo...';
            }

            const formData = new FormData();
            formData.append('file', file);
            formData.append('logo_type', logoType);

            const response = await fetch('/upload-logo', { // This endpoint now talks to Drive JSON
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: formData
            });

            if (!response.ok) {
                throw new Error('Failed to upload logo');
            }

            const data = await response.json();
            const logoUrl = data.logo_url;

            // Update preview
            if (preview) {
                preview.src = logoUrl;
                preview.classList.remove('hidden');
            }
            if (placeholder) {
                placeholder.classList.add('hidden');
            }

            // Save to localStorage as backup
            localStorage.setItem(logoType === 'light' ? 'logoLight' : 'logoDark', logoUrl);

            // Update sidebar logo
            if (typeof updateSidebarLogo === 'function') {
                updateSidebarLogo();
            }

            alert('Logo subido exitosamente a Google Drive ✓');
        } catch (error) {
            console.error('Error uploading logo:', error);
            alert('Error al subir logo: ' + error.message);
            if (placeholder) {
                placeholder.textContent = 'Sin Logo';
            }
        }
    }

    async function loadLogosFromSettings() {
        try {
            // Fetch from new Settings API (Drive JSON backed) instead of User Profile (DB backed)
            const response = await fetch('/settings', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            if (response.ok) {
                const settings = await response.json();

                // Load light logo
                if (settings.logo_light_url) {
                    const lightPreview = document.getElementById('settingsLogoLightPreview');
                    const lightPlaceholder = document.getElementById('settingsLogoLightPlaceholder');
                    if (lightPreview) {
                        lightPreview.src = settings.logo_light_url;
                        lightPreview.classList.remove('hidden');
                    }
                    if (lightPlaceholder) {
                        lightPlaceholder.classList.add('hidden');
                    }
                    localStorage.setItem('logoLight', settings.logo_light_url);
                }

                // Load dark logo
                if (settings.logo_dark_url) {
                    const darkPreview = document.getElementById('settingsLogoDarkPreview');
                    const darkPlaceholder = document.getElementById('settingsLogoDarkPlaceholder');
                    if (darkPreview) {
                        darkPreview.src = settings.logo_dark_url;
                        darkPreview.classList.remove('hidden');
                    }
                    if (darkPlaceholder) {
                        darkPlaceholder.classList.add('hidden');
                    }
                    localStorage.setItem('logoDark', settings.logo_dark_url);
                }

                // Update sidebar
                if (typeof updateSidebarLogo === 'function') {
                    updateSidebarLogo();
                }
            }
        } catch (error) {
            console.error('Error loading logos from settings:', error);
        }
    }

    async function updateLoginScreenLogo() {
        const loginContainer = document.getElementById('loginLogoContainer');
        const loginImg = document.getElementById('loginLogoImg');
        const loginInitial = document.getElementById('loginDefaultInitial');

        if (!loginContainer || !loginImg || !loginInitial) return;

        // 1. Try localStorage first (fastest)
        let logoUrl = localStorage.getItem('logoLight');

        // 2. If not found, fetch from public API
        if (!logoUrl) {
            try {
                const response = await fetch('/public-settings');
                if (response.ok) {
                    const settings = await response.json();
                    if (settings.logo_light_url) {
                        logoUrl = settings.logo_light_url;
                        // Save for next time
                        localStorage.setItem('logoLight', logoUrl);
                        if (settings.logo_dark_url) {
                            localStorage.setItem('logoDark', settings.logo_dark_url);
                        }
                    }
                }
            } catch (e) {
                console.error("Could not load public settings:", e);
            }
        }

        // Apply if we found a logo
        if (logoUrl) {
            loginImg.src = logoUrl;
            loginImg.classList.remove('hidden');
            loginInitial.classList.add('hidden');
            // Remove blue background/white text for logo
            loginContainer.classList.remove('bg-blue-600', 'text-white');
            loginContainer.classList.add('bg-transparent');
        }
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initDriveLogoHandlers();
            updateLoginScreenLogo();
        });
    } else {
        initDriveLogoHandlers();
        updateLoginScreenLogo();
    }
})();
