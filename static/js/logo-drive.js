// Logo management - Google Drive integration (Simplified)
// Logos are stored on Drive with fixed filenames.
// Served via backend proxy: /logo/light, /logo/dark, /logo/favicon

(function () {

    function initDriveLogoHandlers() {
        // Light logo
        const lightInput = document.getElementById('settingsLogoLightInput');
        if (lightInput) {
            lightInput.addEventListener('change', async (e) => {
                await uploadLogo(e.target.files[0], 'light');
            });
        }

        // Dark logo
        const darkInput = document.getElementById('settingsLogoDarkInput');
        if (darkInput) {
            darkInput.addEventListener('change', async (e) => {
                await uploadLogo(e.target.files[0], 'dark');
            });
        }

        // Favicon
        const faviconInput = document.getElementById('settingsFaviconInput');
        if (faviconInput) {
            faviconInput.addEventListener('change', async (e) => {
                await uploadLogo(e.target.files[0], 'favicon');
            });
        }

        // Load existing logos
        loadExistingLogos();
    }

    async function uploadLogo(file, logoType) {
        if (!file) return;

        const ids = getElementIds(logoType);
        const placeholder = document.getElementById(ids.placeholder);

        try {
            if (placeholder) placeholder.textContent = 'Subiendo...';

            const formData = new FormData();
            formData.append('file', file);
            formData.append('logo_type', logoType);

            const response = await fetch('/upload-logo', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: formData
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.detail || 'Upload failed');
            }

            const data = await response.json();

            // Show preview using the proxy URL (add cache-buster)
            const proxyUrl = data.logo_url + '?t=' + Date.now();
            showPreview(logoType, proxyUrl);

            // Apply immediately
            if (logoType === 'favicon') {
                applyFavicon(proxyUrl);
            } else {
                if (typeof updateSidebarLogo === 'function') updateSidebarLogo();
                if (logoType === 'light') applyLoginLogo(proxyUrl);
            }

            alert('Logo subido exitosamente ✓');
        } catch (error) {
            console.error('Error uploading logo:', error);
            alert('Error al subir logo: ' + error.message);
            if (placeholder) placeholder.textContent = 'Error';
        }
    }

    function getElementIds(logoType) {
        if (logoType === 'light') return { preview: 'settingsLogoLightPreview', placeholder: 'settingsLogoLightPlaceholder' };
        if (logoType === 'dark') return { preview: 'settingsLogoDarkPreview', placeholder: 'settingsLogoDarkPlaceholder' };
        if (logoType === 'favicon') return { preview: 'settingsFaviconPreview', placeholder: 'settingsFaviconPlaceholder' };
        return {};
    }

    function showPreview(logoType, url) {
        const ids = getElementIds(logoType);
        const preview = document.getElementById(ids.preview);
        const placeholder = document.getElementById(ids.placeholder);
        if (preview) {
            preview.src = url;
            preview.classList.remove('hidden');
        }
        if (placeholder) placeholder.classList.add('hidden');
    }

    async function loadExistingLogos() {
        try {
            // Use public-settings to check which logos exist
            const response = await fetch('/public-settings');
            if (!response.ok) return;

            const settings = await response.json();

            // Light logo
            if (settings.logo_light_url) {
                const url = settings.logo_light_url + '?t=' + Date.now();
                showPreview('light', url);
                applyLoginLogo(url);
                // Save for sidebar
                localStorage.setItem('logoLight', url);
            }

            // Dark logo
            if (settings.logo_dark_url) {
                const url = settings.logo_dark_url + '?t=' + Date.now();
                showPreview('dark', url);
                localStorage.setItem('logoDark', url);
            }

            // Favicon
            if (settings.favicon_url) {
                const url = settings.favicon_url + '?t=' + Date.now();
                showPreview('favicon', url);
                applyFavicon(url);
            }

            if (typeof updateSidebarLogo === 'function') updateSidebarLogo();
        } catch (error) {
            console.error('Error loading logos:', error);
        }
    }

    function applyFavicon(url) {
        if (!url) return;
        let link = document.querySelector("link[rel~='icon']");
        if (!link) {
            link = document.createElement('link');
            link.rel = 'icon';
            document.head.appendChild(link);
        }
        link.href = url;
    }

    function applyLoginLogo(url) {
        const loginContainer = document.getElementById('loginLogoContainer');
        const loginImg = document.getElementById('loginLogoImg');
        const loginInitial = document.getElementById('loginDefaultInitial');
        const loginTitle = document.getElementById('loginTitle');

        if (!loginContainer || !loginImg || !loginInitial) return;

        loginImg.src = url;
        loginImg.classList.remove('hidden');
        loginInitial.classList.add('hidden');

        loginContainer.classList.remove('bg-blue-600', 'text-white', 'w-10', 'h-10', 'rounded-lg', 'mr-3');
        loginContainer.classList.add('bg-transparent', 'w-full', 'h-32', 'mb-2');

        if (loginTitle) loginTitle.classList.add('hidden');
    }

    // Init
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initDriveLogoHandlers);
    } else {
        initDriveLogoHandlers();
    }
})();
