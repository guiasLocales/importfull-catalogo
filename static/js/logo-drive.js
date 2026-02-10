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

        // Favicon handler
        const faviconInput = document.getElementById('settingsFaviconInput');
        if (faviconInput) {
            faviconInput.addEventListener('change', async (e) => {
                await uploadLogoToDrive(e.target.files[0], 'favicon');
            });
        }

        // Load saved logos from settings
        loadLogosFromSettings();
    }

    async function uploadLogoToDrive(file, logoType) {
        if (!file) return;

        let previewId, placeholderId;

        if (logoType === 'light') {
            previewId = 'settingsLogoLightPreview';
            placeholderId = 'settingsLogoLightPlaceholder';
        } else if (logoType === 'dark') {
            previewId = 'settingsLogoDarkPreview';
            placeholderId = 'settingsLogoDarkPlaceholder';
        } else if (logoType === 'favicon') {
            previewId = 'settingsFaviconPreview';
            placeholderId = 'settingsFaviconPlaceholder';
        }

        const preview = document.getElementById(previewId);
        const placeholder = document.getElementById(placeholderId);

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
            if (logoType === 'light') localStorage.setItem('logoLight', logoUrl);
            else if (logoType === 'dark') localStorage.setItem('logoDark', logoUrl);
            else if (logoType === 'favicon') localStorage.setItem('faviconUrl', logoUrl);

            // Update UI immediately
            if (logoType === 'favicon') {
                updateAppFavicon(logoUrl);
            } else {
                if (typeof updateSidebarLogo === 'function') {
                    updateSidebarLogo();
                }
                updateLoginScreenLogo(); // Also update login screen if light logo changed
            }

            alert('Imagen subida exitosamente a Google Drive ✓');
        } catch (error) {
            console.error('Error uploading logo:', error);
            alert('Error al subir imagen: ' + error.message);
            if (placeholder) {
                placeholder.textContent = 'Error';
            }
        }
    }

    function updateAppFavicon(url) {
        if (!url) return;

        let link = document.querySelector("link[rel~='icon']");
        if (!link) {
            link = document.createElement('link');
            link.rel = 'icon';
            document.head.appendChild(link);
        }
        link.href = url;
    }

    async function loadLogosFromSettings() {
        try {
            // First try public settings for speed and unauth access (login screen)
            const response = await fetch('/public-settings');

            if (response.ok) {
                const settings = await response.json();

                // Load light logo
                if (settings.logo_light_url) {
                    updatePreview('settingsLogoLightPreview', 'settingsLogoLightPlaceholder', settings.logo_light_url);
                    localStorage.setItem('logoLight', settings.logo_light_url);
                }

                // Load dark logo
                if (settings.logo_dark_url) {
                    updatePreview('settingsLogoDarkPreview', 'settingsLogoDarkPlaceholder', settings.logo_dark_url);
                    localStorage.setItem('logoDark', settings.logo_dark_url);
                }

                // Load favicon
                if (settings.favicon_url) {
                    updatePreview('settingsFaviconPreview', 'settingsFaviconPlaceholder', settings.favicon_url);
                    localStorage.setItem('faviconUrl', settings.favicon_url);
                    updateAppFavicon(settings.favicon_url);
                }

                // Update UI
                if (typeof updateSidebarLogo === 'function') {
                    updateSidebarLogo();
                }
                updateLoginScreenLogo();
            }
        } catch (error) {
            console.error('Error loading settings:', error);
        }
    }

    function updatePreview(previewId, placeholderId, url) {
        const preview = document.getElementById(previewId);
        const placeholder = document.getElementById(placeholderId);
        if (preview) {
            preview.src = url;
            preview.classList.remove('hidden');
        }
        if (placeholder) {
            placeholder.classList.add('hidden');
        }
    }

    async function updateLoginScreenLogo() {
        const loginContainer = document.getElementById('loginLogoContainer');
        const loginImg = document.getElementById('loginLogoImg');
        const loginInitial = document.getElementById('loginDefaultInitial');

        if (!loginContainer || !loginImg || !loginInitial) return;

        // 1. Try localStorage first (fastest)
        let logoUrl = localStorage.getItem('logoLight');

        // 2. Fallback to settings fetch (already done in loadLogosFromSettings but good as backup)

        // Apply if we found a logo
        if (logoUrl) {
            const loginTitle = document.getElementById('loginTitle');

            // Show image, Hide initial
            loginImg.src = logoUrl;
            loginImg.classList.remove('hidden');
            loginInitial.classList.add('hidden');

            // Remove blue background and maximize container
            loginContainer.classList.remove('bg-blue-600', 'text-white', 'w-10', 'h-10', 'rounded-lg', 'mr-3');
            loginContainer.classList.add('bg-transparent', 'w-full', 'h-32', 'mb-2'); // Maximize width, make height 32 (128px)

            // Hide "Iniciar Sesión" text
            if (loginTitle) {
                loginTitle.classList.add('hidden');
            }
        }
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initDriveLogoHandlers();
            // Apply cached favicon immediately if available
            updateAppFavicon(localStorage.getItem('faviconUrl'));
            updateLoginScreenLogo();
        });
    } else {
        initDriveLogoHandlers();
        updateAppFavicon(localStorage.getItem('faviconUrl'));
        updateLoginScreenLogo();
    }
})();
